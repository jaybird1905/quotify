// Load environment variables from `.env` file (optional)
require('dotenv').config();

const slackEventsApi = require('@slack/events-api');
const SlackClient = require('@slack/client').WebClient;
const passport = require('passport');
const SlackStrategy = require('@aoberoi/passport-slack').default.Strategy;
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
//add mongo
const MongoClient = require('mongodb').MongoClient
var db

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

// *** Plug the event adapter into the express app as middleware ***
app.use('/slack/events', slackEvents.expressMiddleware());

// // connect to the mongo db
MongoClient.connect('mongodb://***:****@ds147884.mlab.com:47884/quote-bot', (err, database) => {
   if (err) return console.log(err)
   db = database
//   // sit and wait for traffic
//   app.listen(3000, () => {
//     console.log('LiStEnInG oN pOrT: 3000')
//   })
});

// *** Greeting any user that says "hi" ***
slackEvents.on('message', (message, body) => {
  // Only deal with messages that have no subtype (plain messages) and contain 'hi'
  if (!message.subtype && message.text.indexOf('Mirror mirror, on the wall -- who is the gayest Mexican of them all?') >= 0) {
    // Initialize a client
    const slack = getClientByTeamId(body.team_id);
    // Handle initialization failure
    if (!slack) {
      return console.error('No authorization found for this team. Did you install this app again after restarting?');
    }
    // Respond to the message back in the same channel
    slack.users.info(message.user)
    //console.log(slack.users.list());
    slack.chat.postMessage(message.channel, '@tripz of course! :nail_care::skin-tone-3:')
      .catch(console.error);
  }
});

// *** Responding to reactions with the same emoji ***
slackEvents.on('reaction_added', (event, body) => {
  // Initialize a client
  const slack = getClientByTeamId(body.team_id);
  // Handle initialization failure
  if (!slack) {
    return console.error('No authorization found for this team. Did you install this app again after restarting?');
  }
  // Respond to the reaction back with the same emoji
//  slack.chat.postMessage(event.item.channel, `:${event.reaction}:`)
if(event.reaction.toString() === "quote"){
  // add a quote to the db
        console.log(event);
        const text = slack.channels.history('xoxp-****', event.item.channel, 0,0,event.item.ts,event.item.ts,event.item.ts);

       db.collection('quotes').save(body, (err, result) => {
         if (err) return console.log(err)
         console.log('saved to database');
       })
  slack.chat.postMessage(event.item.channel, "Fuck you Check, Doug, and Lynx!")
      .catch(console.error);
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
