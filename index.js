// Load environment variables from `.env` file (optional)
require('dotenv').config();
const async = require ('async');
const slackEventsApi = require('@slack/events-api');
const SlackClient = require('@slack/client').WebClient;
const passport = require('passport');
const SlackStrategy = require('@aoberoi/passport-slack').default.Strategy;
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const math = require('math');
//add mongo
const MongoClient = require('mongodb').MongoClient
var db;

// Automatically reconnect after an error response from Slack.
var autoReconnect = true;

// Put your bot API token here
// TODO: FIX THIS!!
var token = token;

// Put your slack team name here
// We'll use this when piecing together our API call
var team = "lgoflegends";

// Track bot user, for detecting the bot's own messages
var bot;

// The type of conversation we're dealing with
var family;

// We'll define our own custom API call to get channel history
// See the note for step 10 above
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

var ephemeralQuoteFail =
{
  "response_type": "ephemeral",
  "replace_original": false,
  "text": "That user doesn't have any saved quotes. Add some!"
}

var ephemeralQuoteSaved =
{
  "response_type": "ephemeral",
  "replace_original": false,
  "text": "Quote saved!"
}

var getUsername = function() {
  this.get = function(value, callback) {
  var xhr = new XMLHttpRequest();
  // This builds the actual structure of the API call using our provided variables
  var url = "https://" + team + ".slack.com/api/" + "users.info?token=" + token + "&user=" + value;
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4 && xhr.status == 200)
      callback(xhr.responseText);
    }
    xhr.open("GET", url, true);
    xhr.send();
  }
}


var getChannelHistory = function() {
  this.get = function(family, value, callback) {
  var xhr = new XMLHttpRequest();
  // This builds the actual structure of the API call using our provided variables
  var url = "https://" + team + ".slack.com/api/" + family + ".history?token=" + token + "&channel=" + value;
  //console.log(url);
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4 && xhr.status == 200)
      callback(xhr.responseText);
    }
    xhr.open("GET", url, true);
    xhr.send();
  }
}

var getConversationInfo = function() {
  this.get = function(value, callback) {
  var xhr = new XMLHttpRequest();
  // This builds the actual structure of the API call using our provided variables
  var url = "https://" + team + ".slack.com/api/conversations.info" + "?token=" + token + "&channel=" + value;
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4 && xhr.status == 200)
      callback(xhr.responseText);
    }
    xhr.open("GET", url, true);
    xhr.send();
  }
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

// *** Initialize event adapter using verification token from environment variables ***
const slackEvents = slackEventsApi.createSlackEventAdapter(process.env.SLACK_VERIFICATION_TOKEN, {
  includeBody: true
});

// Initialize a data structures to store team authorization info (typically stored in a database)
const botAuthorizations = {}

// Helpers to cache and lookup appropriate client
// NOTE: Not enterprise-ready. if the event was triggered inside a shared channel, this lookup
// could fail but there might be a suitable client from one of the other teams that is within that
// shared channel.
const clients = {};

// This should work in node.js and other ES5 compliant implementations.
function isEmptyObject(obj) {
  return !Object.keys(obj).length;
}

function getClientByTeamId(teamId) {
  if (!clients[teamId] && botAuthorizations[teamId]) {
    clients[teamId] = new SlackClient(botAuthorizations[teamId]);
  }
  if (clients[teamId]) {
    return clients[teamId];
  }
  return null;
}

// Initialize Add to Slack (OAuth) helpers
passport.use(new SlackStrategy({
  clientID: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  skipUserProfile: true,
}, (accessToken, scopes, team, extra, profiles, done) => {
  botAuthorizations[team.id] = extra.bot.accessToken;
  done(null, {});
}));

// Initialize an Express application
const app = express();
app.use(bodyParser.json());
// add body-parser as a helper for express to digest the incoming json
app.use(bodyParser.urlencoded({extended: true}))

//
// TODO: fix this!
MongoClient.connect(mongo, (err, database) => {
   if (err) return console.log(err)
   db = database
});


// Plug the Add to Slack (OAuth) helpers into the express app
app.use(passport.initialize());
app.get('/', (req, res) => {
  res.send('<a href="/auth/slack"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>');
});
app.get('/auth/slack', passport.authenticate('slack', {
  scope: ['bot']
}));
app.get('/auth/slack/callback',
  passport.authenticate('slack', { session: false }),
  (req, res) => {
    res.send('<p>Greet and React was successfully installed on your team.</p>');
  },
  (err, req, res, next) => {
    res.status(500).send(`<p>Greet and React failed to install</p> <pre>${err}</pre>`);
  }
);

app.post('/slack/commands', (req, res) => {


  var reqBody = req.body;
  var responseURL = reqBody.response_url;

  res.status(200); // best practice to respond with empty 200 status code

  // the user's realname
  var name = "";
  // get the tagged user's user id
  var taggeduser = req.body.text.substr(2, 9);
  // create an async series to order the priority of the function calls
  async.series([

  function(callback) {
    // create a new history object and create the string we need to send out to make our request
    username = new getUsername();

    username.get(taggeduser, function(response) {
      // Now that we have our messages,
      // let's parse them to make them readable
      json = JSON.parse(response);
      if(!json.user.hasOwnProperty('real_name'))
      {
        return res.status(200).json(ephemeralQuoteFail);
      }
      name = json.user.real_name;
      callback();
    });
  },
  function(callback) {
    // Initialize a client

    const slack = getClientByTeamId(req.body.team_id);

    if (!slack) {
      return console.error('No authorization found for this team. Did you install this app again after restarting?');
    }

    //create or grab the collection of quotes for this user
    var collection = db.createCollection(taggeduser);
    console.log(collection);

    // get a random document back from the user's quote collection
    result = [];
    db.collection(taggeduser).aggregate({ $sample: { size: 1 }}, function(err, result) {
           if (err) throw err;

           //check for an empty quotes object
         if(!isEmptyObject(result)){
           console.log(result);
           res.status(200);
            //  res.status(200);
            // put together the random quote message and post it to the channel
            var message = "\"" + result[0].messages[0].text + "\" - " + name;
            slack.chat.postMessage(req.body.channel_id, message);
            res.status(200);
            callback();
         }
         else {
           //return slack.chat.postMessage(req.body.channel_id, `This user doesn't have any saved quotes. Add some!`);
              res.status(200).json(ephemeralQuoteFail); // best practice to respond with empty 200 status code
              callback();
             }
          });
       }],
  function(err) { //This function gets called after the two tasks have called their "task callbacks"
          if (err) return next(err);
          //Here locals will be populated with `user` and `posts`
          //Just like in the previous example
      }
    );

  });

// *** Plug the event adapter into the express app as middleware ***
app.use('/slack/events', slackEvents.expressMiddleware());

//  *** Responding to reactions with the same emoji ***
slackEvents.on('reaction_added', (event, body) => {


    // var collections = db.listCollections();
    //
    //   for(var i=0;i<collections.length;i++)
    //   {
    //     console.log(body.message.ts);
    //     db.collections[i].aggregate([{ $match: body.message.ts },{ $group: { _id: null, count: { $sum: 1 } } }], function(err,result){
    //          if (err) throw err;
    //          console.log(result);
    //   });
    //   }

  // Initialize a client
  []
const slack = new SlackClient(token);

  // Handle initialization failure
  if (!slack) {
    return console.error('No authorization found for this team. Did you install this app again after restarting?');
  }
  // Respond to the reaction back with the same emoji
//  slack.chat.postMessage(event.item.channel, `:${event.reaction}:`)
if(event.reaction.toString() === "quote"){

  invokingUser = "";
  // create an async series to order the priority of the function calls
  async.series([

  function(callback){
    // create a new history object and create the string we need to send out to make our request
    username = new getUsername();

    username.get(event.user, function(response) {
      // Now that we have our messages,
      // let's parse them to make them readable
      json = JSON.parse(response);
      invokingUser = json.user.real_name;
      callback();
    });
  },

  function(callback) {

    convoInfo = new getConversationInfo();
    convoInfo.get(event.item.channel, function(response) {
              // Now that we have our messages,
              // let's parse them to make them readable
                  json = JSON.parse(response);
                  // grab the channel type from the response
                  // isChannel = json.channel.is_channel;
                  if(!json.channel.is_channel){
                    family = "groups";
                  }
                  else {
                    family = "channels";
                  }
                   callback();
              });
          },
        function(callback) {

          // if(event.item.ts === db.ts)
          //   {
          //     console.log('Event already exists!');
          //   }
          // create a new history object and create the string we need to send out to make our request
          history = new getChannelHistory();
          fullstring = event.item.channel + "&latest=" + event.item.ts + "&inclusive=true&count=1";

          history.get(family,fullstring, function(response) {
            // Now that we have our messages,
            // let's parse them to make them readable
            json = JSON.parse(response);
            json.team_id = {};
            json.team_id = body.team_id;
            JSON.stringify(json);
            // make sure we got back good json
            if(json.ok){
              //Make sure the user is a human and not a bot
              if(!json.messages[0].hasOwnProperty('bot_id')){
              var user = String(json.messages[0].user);
            //  console.log("Type is:" + typeof user + " -- " + user);
            // create a collection using the user's id, unless it already exists
            var collection = db.createCollection(user);
              // insert the message into the collection
                 db.collection(user).save(json, (err, data) => {
                   if (err) return console.log(err);
                   //slack.chat.postMessage(event.item.channel, "Quote saved by " + invokingUser);
                   console.log('saved to database');
                   slack.chat.postEphemeral(event.item.channel, `Quote Saved! :quote:`, event.user);
                 })
              }
          }else{console.log("Error:" + json.error)}
           callback();
          });
        }],
        function(err) { //This function gets called after the two tasks have called their "task callbacks"
            if (err) return next(err);
        });
      }
    });

// *** Handle errors ***
slackEvents.on('error', (error) => {
  if (error.code === slackEventsApi.errorCodes.TOKEN_VERIFICATION_FAILURE) {
    // This error type also has a `body` propery containing the request body which failed verification.
    console.error(`An unverified request was sent to the Slack events Request URL. Request body: \
${JSON.stringify(error.body)}`);
  } else {
    console.error(`An error occurred while handling a Slack event: ${error.message}`);
  }
});

// Start the express application
const port = process.env.PORT || 3000;
http.createServer(app).listen(port, () => {
  console.log(`server listening on port ${port}`);
});
