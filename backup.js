// We're using the slack-client library
var SlackClient = require('slack-client');

// Automatically reconnect after an error response from Slack.
var autoReconnect = true;

// Put your bot API token here
var token = "YOUR TOKEN HERE";

// Put your slack team name here
// We'll use this when piecing together our API call
var team = "YOUR TEAM HERE";

var slackClient = new SlackClient(token, autoReconnect);

// Track bot user, for detecting the bot's own messages
var bot;

// We'll define our own custom API call to get channel history
// See the note for step 10 above
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

var getChannelHistory = function() {
  this.get = function(family, value, callback) {
  var xhr = new XMLHttpRequest();
  // This builds the actual structure of the API call using our provided variables
  var url = "https://" + team + ".slack.com/api/" + family + ".history?token=" + token + "&channel=" + value;
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4 && xhr.status == 200)
      callback(xhr.responseText);
    }
    xhr.open("GET", url, true);
    xhr.send();
  }
}
