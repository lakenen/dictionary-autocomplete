function handleRequest(request, sender, sendResponse) {
	if (request === "options") {
		var response = {};
		sendResponse(response);
	}
}
chrome.extension.onMessage.addListener(handleRequest);
