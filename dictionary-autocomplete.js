/*global window:false, chrome:false, console:false, _:false, jQuery: false */

(function ($) {
	"use strict";
	var dictionary = [],
		exceptions = [],
		additions = [],
		session = [],
		keydown, $menu,
		currentEl,
		currentPos,
		currentWord,
		maxWidth = 0,
		maxHeight = 0,
		menuShowing = false,
		lastKeyWasDelete = false,
		selectedClass = 'dictionary-autocomplete-item-selected',
		highlightedClass = 'dictionary-autocomplete-chars-highlighted';

	function loadDictionary(callback) {
		$.ajax({
			url: chrome.extension.getURL('enable1.txt'),
			success: function(response) {
				dictionary = response.split(/\s+/);
				//dictionary = _.difference(dictionary, exceptions || []);
				//dictionary = _.union(dictionary, additions || []);
				//dictionary.sort();
				callback();
			}
		});
	}

	function loadOptions(callback) {
		chrome.extension.sendMessage('options', function (options) {
			exceptions = options.exceptions || [];
			additions = options.additions || [];
			//var disabledDomains = options.disabledDomains || [];
			//if (disabledDomains.join('').indexOf(document.location.host) > -1) {
				//return;
			//}
			callback();
		});
	}

	function loadAll(callback) {
		loadOptions(function () {
			loadDictionary(callback);
		});
	}

	function initialize() {
		loadAll(function () {
			$(window).on('input', inputHandler);
			$(document).on('mousedown', function (ev) {
				var target = $(ev.target).parents().andSelf();
				if (!target.is($menu)) {
					hideMenu();
				}
			});
			$(window).on('keydown', keydownHandler);
			$(window).scroll(positionMenu);
			$menu = $('<div>').addClass('dictionary-autocomplete-menu')
				.css({ position: 'fixed' })
				.appendTo(document.body).hide();
		});
	}

	function keydownHandler(ev) {
		//console.log(ev.keyCode);
		lastKeyWasDelete = false;
		switch (ev.keyCode) {
			case 8: //backspace
				lastKeyWasDelete = true;
				break;
			case 13: //return
				if (menuShowing) {
					acceptSelected();
					ev.preventDefault();
				}
				break;
			case 37: //left
			case 39: //right
			case 27: //esc
				hideMenu();
				break;
			case 38: //up
				if (menuShowing) {
					selectPrevious();
					ev.preventDefault();
				}
				break;
			case 40: //down
				if (menuShowing) {
					selectNext();
					ev.preventDefault();
				}
				break;
		}
	}

	function inputHandler(ev) {
		var el = ev.target,
			$el = $(el),
			text, position, words;
		if ($el.attr('type') == 'password') {
			return;
		}

		if (lastKeyWasDelete && !currentWord) {
			hideMenu();
			return;
		}
		text = $el.val();
		position = getTextSelectionEnd(el);
		text = text.substring(0, position+1);
		position = regexLastIndexOf(text, /\W/) + 1;
		text = text.substring(position);
		updateSessionWords($el.val().substring(0, position) + $el.val().substring(position + text.length));
		if (text.length > 0) {
			words = findWords(text);
			currentWord = text;
			currentEl = el;
			currentPos = position;
			showMenu($el, words, position);
		} else {
			hideMenu();
		}
	}

	function showMenu($el, words) {
		if (words.length === 0) {
			hideMenu();
			return;
		}
		menuShowing = true;

		var letters = currentWord.split('')
		words = _.map(words, function (w) {
			return letters.map(function (l) {
				var i = w.indexOf(l);
				var cw = w.substr(0, i);
				w = w.substr(i + 1);
				return cw + '<span class="'+highlightedClass+'">'+l+'</span>';
			}).join('') + w;
		}).join('</li><li>');
		$menu.show().empty().append('<ul><li class="'+selectedClass+'">'+words+'</li></ul>');
		$menu.find('li').on('click', function () {
			accept($(this).text());
		});
		positionMenu();
	}

	function positionMenu() {
		if (!menuShowing) {
			return;
		}
		var $el = $(currentEl),
			rect = getTextBoundingRect(currentEl, currentPos),
			off = $el.offset(),
			width = $menu.outerWidth(),
			height = $menu.outerHeight(),
			minOffsetTop = parseFloat($el.css('font-size')) +
				parseFloat($el.css('padding-top')) +
				parseFloat($el.css('border-top')),
			left, top;
		if (width > maxWidth) {
			maxWidth = width;
		}
		if (height > maxHeight) {
			maxHeight = height;
		}
		left = rect.left - $el.scrollLeft();
		top = rect.top + Math.max(rect.height, minOffsetTop) - $el.scrollTop();
		if (left + maxWidth > $(window).width()) {
			left -= width;
		}
		if (top + maxHeight > $(window).height()) {
			top -= height + rect.height;
		}
		$menu.css({
			left: left,
			top: top
		});
	}

	function hideMenu() {
		currentWord = currentEl = currentPos = null;
		$menu.hide().empty();
		menuShowing = false;
	}

	function acceptSelected() {
		accept($menu.find('.'+selectedClass).text());
	}

	function accept(word) {
		var $el = $(currentEl);
		$el.val($el.val().substring(0, currentPos) + word + $el.val().substring(currentPos+currentWord.length));
		setCaretPosition(currentEl, currentPos + word.length);
		hideMenu();
	}

	function selectPrevious() {
		var $item = $menu.find('.'+selectedClass)
			.removeClass(selectedClass)
			.prevWrap().addClass(selectedClass);
		$menu.scrollTo($item);
	}

	function selectNext() {
		var $item = $menu.find('.'+selectedClass)
			.removeClass(selectedClass)
			.nextWrap().addClass(selectedClass);
		$menu.scrollTo($item);
	}

	function updateSessionWords(text) {
		session = _.uniq(text.replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/g)).sort();
	}

	function createSearchPattern(text) {
		function wrap(s, n) {
			s = n + (s || '');
			if (s.length > 0) {
				s = '(?=.*' + s + ')';
			}
			return s;
		}
		text = text.replace(/\W/, '');
    // the first char must be at the beginning, but others can be spread
    // throughout the word in order (fuzzy search)
		text = text.charAt(0) + text.substr(1).split('').reverse().reduce(wrap, '');
		return new RegExp('^'+text, 'i');
	}

	function findWords(text) {
		var found = [],
			pattern = createSearchPattern(text);
		function _find(arr) {
			var i, l;
			for (i = 0, l = arr.length; i < l && found.length <= 20; ++i) {
				if (arr[i].match(pattern)) {
					found.push(arr[i]);
					found = _.uniq(found);
				}
			}
		}
		_find(session);
		_find(dictionary);
		return found;
	}

	function getTextSelectionEnd(el) {
		var bm, sel, sleft;
		if (document.selection) { //IE
			bm = document.selection.createRange().getBookmark();
			sel = el.createTextRange();
			sel.moveToBookmark(bm);
			sleft = el.createTextRange();
			sleft.collapse(true);
			sleft.setEndPoint("EndToStart", sel);
			return sleft.text.length + sel.text.length;
		}
		return el.selectionEnd; //ff and chrome
	}

	// @author Rob W    http://stackoverflow.com/users/938089/rob-w
	// @name        getTextBoundingRect
	// @param input     Required HTMLElement with `value` attribute
	// @param selectionStart Optional number: Start offset. Default 0
	// @param selectionEnd  Optional number: End offset. Default selectionStart
	// @param debug     Optional boolean. If true, the created test layer
	//            will not be removed.
	function getTextBoundingRect(input, selectionStart, selectionEnd, debug) {
		// Basic parameter validation
		if(!input || !('value' in input)) return input;
		if(typeof selectionStart == "string") selectionStart = parseFloat(selectionStart);
		if(typeof selectionStart != "number" || isNaN(selectionStart)) {
			selectionStart = 0;
		}
		if(selectionStart < 0) selectionStart = 0;
		else selectionStart = Math.min(input.value.length, selectionStart);
		if(typeof selectionEnd == "string") selectionEnd = parseFloat(selectionEnd);
		if(typeof selectionEnd != "number" || isNaN(selectionEnd) || selectionEnd < selectionStart) {
			selectionEnd = selectionStart;
		}
		if (selectionEnd < 0) selectionEnd = 0;
		else selectionEnd = Math.min(input.value.length, selectionEnd);

		// If available (thus IE), use the createTextRange method
		if (typeof input.createTextRange == "function") {
			var range = input.createTextRange();
			range.collapse(true);
			range.moveStart('character', selectionStart);
			range.moveEnd('character', selectionEnd - selectionStart);
			return range.getBoundingClientRect();
		}
		// createTextRange is not supported, create a fake text range
		var offset = getInputOffset(),
			topPos = offset.top,
			leftPos = offset.left,
			width = getInputCSS('width', true),
			height = getInputCSS('height', true);

			// Styles to simulate a node in an input field
		var cssDefaultStyles = "white-space:pre-wrap;padding:0;margin:0;",
			listOfModifiers = ['direction', 'font-family', 'font-size', 'font-size-adjust', 'font-variant', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'text-align', 'text-indent', 'text-transform', 'word-wrap', 'word-spacing'];

		topPos += getInputCSS('padding-top', true);
		topPos += getInputCSS('border-top-width', true);
		leftPos += getInputCSS('padding-left', true);
		leftPos += getInputCSS('border-left-width', true);
		leftPos += 1; //Seems to be necessary

		for (var i=0; i<listOfModifiers.length; i++) {
			var property = listOfModifiers[i];
			cssDefaultStyles += property + ':' + getInputCSS(property) +';';
		}
		// End of CSS variable checks

		var text = input.value,
			textLen = text.length,
			fakeClone = document.createElement("div");
		if(selectionStart > 0) appendPart(0, selectionStart);
		var fakeRange = appendPart(selectionStart, selectionEnd);
		if(textLen > selectionEnd) appendPart(selectionEnd, textLen);

		// Styles to inherit the font styles of the element
		fakeClone.style.cssText = cssDefaultStyles;

		// Styles to position the text node at the desired position
		fakeClone.style.position = "absolute";
		fakeClone.style.top = topPos + "px";
		fakeClone.style.left = leftPos + "px";
		fakeClone.style.width = width + "px";
		fakeClone.style.height = height + "px";
		document.body.appendChild(fakeClone);
		var returnValue = fakeRange.getBoundingClientRect(); //Get rect

		if (!debug) fakeClone.parentNode.removeChild(fakeClone); //Remove temp
		return returnValue;

		// Local functions for readability of the previous code
		function appendPart(start, end){
			var span = document.createElement("span"),
				tmpText = text.substring(start, end);
			span.style.cssText = cssDefaultStyles; //Force styles to prevent unexpected results
			// add a space if it ends in a newline
			if (/[\n\r]$/.test(tmpText)) {
				tmpText += ' ';
			}
			span.textContent = tmpText;
			fakeClone.appendChild(span);
			return span;
		}
		// Computing offset position
		function getInputOffset(){
			var body = document.body,
				win = document.defaultView,
				docElem = document.documentElement,
				box = document.createElement('div');
			box.style.paddingLeft = box.style.width = "1px";
			body.appendChild(box);
			var isBoxModel = box.offsetWidth == 2;
			body.removeChild(box);
			box = input.getBoundingClientRect();
			var clientTop = docElem.clientTop || body.clientTop || 0,
				clientLeft = docElem.clientLeft || body.clientLeft || 0,
				scrollTop = win.pageYOffset || isBoxModel && docElem.scrollTop  || body.scrollTop,
				scrollLeft = win.pageXOffset || isBoxModel && docElem.scrollLeft || body.scrollLeft;
			return {
				top : box.top + scrollTop - clientTop,
				left: box.left + scrollLeft - clientLeft};
		}
		function getInputCSS(prop, isnumber){
			var val = document.defaultView.getComputedStyle(input, null).getPropertyValue(prop);
			return isnumber ? parseFloat(val) : val;
		}
	}

	function setCaretPosition(el, caretPos) {
		if (el !== null) {
			if (el.createTextRange) {
				var range = el.createTextRange();
				range.move('character', caretPos);
				range.select();
			}
			else {
				if (el.selectionStart) {
					el.focus();
					el.setSelectionRange(caretPos, caretPos);
				}
				else
					el.focus();
			}
		}
	}

	function regexIndexOf(str, regex, startpos) {
		var indexOf = str.substring(startpos || 0).search(regex);
		return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
	}

	function regexLastIndexOf(str, regex, startpos) {
		regex = (regex.global) ? regex : new RegExp(regex.source, "g" + (regex.ignoreCase ? "i" : "") + (regex.multiLine ? "m" : ""));
		if(typeof (startpos) == "undefined") {
			startpos = str.length;
		} else if(startpos < 0) {
			startpos = 0;
		}
		var result;
		var stringToWorkWith = str.substring(0, startpos + 1);
		var lastIndexOf = -1;
		var nextStop = 0;
		while((result = regex.exec(stringToWorkWith)) !== null) {
			lastIndexOf = result.index;
			regex.lastIndex = ++nextStop;
		}
		return lastIndexOf;
	}

	initialize();
})(jQuery);


jQuery.fn.prevWrap = function (selector) {
	var prev = $(this).prev(selector);
	if (prev.length <= 0) {
		prev = $(this).parent().children(selector).last();
	}
	return prev;
};
jQuery.fn.nextWrap = function (selector) {
	var next = $(this).next(selector);
	if (next.length <= 0) {
		next = $(this).parent().children(selector).first();
	}
	return next;
};
jQuery.fn.scrollTo = function (target) {
	return this.each(function(){
		var scrollPane = $(this);
		var scrollTarget = (typeof target == "number") ? target : $(target);
		var scrollY = (typeof scrollTarget == "number") ? scrollTarget : scrollTarget.position().top;
		if (scrollY - scrollPane.scrollTop() > scrollPane.height() || scrollY - scrollPane.scrollTop() <= 0) {
			scrollPane.scrollTop(scrollY);
		}
	});
};
