Options = {
	// defaults
	defaults: {
		additions: [],
		exceptions: [],
		disabledDomains: []
	},

	options: null,

	////////////////

	save: function ()
	{
		if (!this.options) return;
		localStorage.setItem('dictionary_autocomplete_options', JSON.stringify(this.options || this.defaults));
	},

	load: function ()
	{
		return this.options = JSON.parse(localStorage.getItem('dictionary_autocomplete_options')) || this.defaults;
	}
};
