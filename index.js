var settings = {
  selectedVoice: "{{voice}}",
  debug: stringToBool("{{debug}}"),
  volume: parseFloat("{{volume}}"),
  muteBrowser: stringToBool("{{muteBrowser}}"),
  playOnMessage: stringToBool("{{playOnMessage}}"),
  playOnReward: stringToBool("{{playOnReward}}"),
  rewardId: "{{rewardId}}",
  playOnCommand: stringToBool("{{playOnCommand}}"),
  commandPrefix: "{{commandPrefix}}",
  playOnBits: stringToBool("{{playOnBits}}"),
  playOnEmulatedBits: stringToBool("{{playOnEmulatedBits}}"),
  minBits: parseInt("{{minBits}}"),
  maxBits: parseInt("{{maxBits}}"),
  showImages: stringToBool("{{showImages}}")
};


// List of additional banned words. Edit it with words
// you don't want to be spoken on tts.
var bannedWords = [
];

// Used to remove cheering text from tts message
var bitsRegularExpression = /(cheer|biblethump|cheerwhal|corgo|uni|showlove|party|seemsgood|pride|kappa|frankerz|heyguys|dansgame|elegiggle|trihard|kreygasm|4head|swiftrage|notlikethis|failfish|vohiyo|pjsalt|mrdestructoid|bday|ripcheer|shamrock)[0-9]+/g

var message = new SpeechSynthesisUtterance("");

var voices = [];

// This object purpose storing all the state of the application,
// it means, all that variables that represents what is happening.
var state = {
  // True if a sound is being played
  // Used by queue interval to only play
  // when no sounds are active.
 playing: false
};

// Stores all messages pending to being sent.
// Queue ensures that no messages are lost by concurrency
// and each message is sent consequently.
var queue = [];

setupImages();

setupBadWords();

// Structure to do specific logs for dev purposes.
var devSettings = {
	logs: {
      setup: true
    }
}

log('setup', "Selected voice: " + settings.selectedVoice);
log('setup', "Debug: " + (settings.debug ? "Yes" : "No"));

// WHen voices are loaded set them up!
speechSynthesis.onvoiceschanged = function () {
  	log('setup', 'Getting voices...');
  	voices = speechSynthesis.getVoices(); 
  	if (voices.length > 1) {
  		log('setup', 'Voices have been setup!');
      	setupVoices();
      	setupVolume();
    }
};

// When voices are received, process them!
window.addEventListener('onEventReceived', function (obj) {
  if (typeof(obj.detail) === 'object' && typeof(obj.detail.event) === 'object') {
    var objEvent = obj.detail.event;
    if (isTwitchEvent(objEvent)) {
  		processTwitchEvent(objEvent);
    }
  }
});

// Interval to manage the sounds queue.
setInterval(function () {
  if (!state.playing && queue.length > 0) {
    var message = queue.shift();
    state.playing = true;
    playSound(message);
  }
}, 100);

// Converts the passed string to boolean.
function stringToBool(stringData) {
	return stringData === "true";
}

// logs a message, of the types enabled in devSettings.
function log(type, message) {
	if (devSettings['logs'][type] === true) {
      console.log(message);
    }
}

// Setup the voice selected by the user.
function setupVoices() {
    message.voice = voices[0];
    voices.every(function (voice, voiceIndex) {
      if (voice.name == settings.selectedVoice) {
        log('setup', "Selected voice: " + voice.name);
        message.voice = voices[voiceIndex];
        return false;
      }
      return true;
    });
}

// Setup images.
// Only show them if enabled, and resize them to layout dimensions.
function setupImages() {
  if (settings.showImages) {
    document.querySelector('.images').classList.remove('hidden');
  }

  var images = document.querySelectorAll('.images img');
  for (imageIndex in images) {
    var image = images[imageIndex];
    image.height = window.innerHeight;
    image.width = window.innerWidth;
  }
}

// Set the message volume.
function setupVolume() {
  message.volume = !isNaN(settings.volume) ? settings.volume : 1;
  log('setup', "Volume: " + message.volume);
}

// Enqueue a message to be played.
function enqueueSound(message) {
   queue.push(message);
}

// Spoke a text by using text to speech.
function playSound(text) {
  if ((!settings.muteBrowser || isOBS()) && !containsBannableWords(text.toLowerCase())) {
    message.text = text.substring(0, 255);
    
    message.onstart = onSpeakStarts;

    message.onend = onSpeakEnds;

    speechSynthesis.speak(message);
  }
}

// Return TRUE if browser is OBS browser source.
function isOBS() {
  return navigator.userAgent.search('OBS') != -1;
}

// Process any event coming from twitch.
function processTwitchEvent(event) {
  if (settings.playOnMessage && isValidTwitchMessage(event)) {
    enqueueSound(event.renderedText.toLowerCase().replace(bitsRegularExpression, ''));
    return;
  }

  if (settings.playOnReward && isValidTwitchRewardReedem(event)) {
    enqueueSound(event.data.text);
    return;
  }

  if (settings.playOnCommand && isValidTwitchCommand(event)) {
    // Only replace first time it appears !tts.
    enqueueSound(event.data.text.replace(getCommandPrefix(), ''));
    return;
  }

  if (settings.playOnBits && isValidTwitchBit(event, false)) {
  	enqueueSound(event.data.message.toLowerCase().replace(bitsRegularExpression, ''));
    return;
  }
  
  
  if (settings.playOnEmulatedBits && isValidTwitchBit(event, true)) {
  	enqueueSound(event.data.message.toLowerCase().replace(bitsRegularExpression, ''));
    return;
  }
}

// Return true if it is twitch event.
function isTwitchEvent(event) {
   return event.provider === 'twitch' || event.service === 'twitch';
}

// Return true if the event is from configured channel reward redemption. 
function isValidTwitchMessage(event) {
  return typeof(event.renderedText) === 'string' && event.renderedText.length > 0;
}

// Return true if the event is from configured channel reward redemption. 
function isValidTwitchRewardReedem(event) {
  return typeof(event.data.tags) === 'object' &&  event.data.tags['custom-reward-id'] == settings.rewardId;
}

// Return true if the event is from a valid twitch chat command (example: !tts).
function isValidTwitchCommand(event) {
  return typeof(event.data.text) === 'string' && event.data.text.startsWith(getCommandPrefix());
}

// Return true if the event is a valid twitch bit.
function isValidTwitchBit(event, isMocked) {
  return event.type === 'cheer'
  	&& typeof(event.data.amount) === 'number' && event.data.amount >= settings.minBits 
  	&& (event.data.amount <= settings.maxBits || settings.maxBits === 0)
    && typeof(event.data.message) === 'string'
  	&& event.data.message.replace(bitsRegularExpression, '').replace(/ /g, '').length > 0
  	&& (isMocked === false && !event.isMock || isMocked === true && event.isMock);
}

// Get the prefix of the twitch chat command.
function getCommandPrefix() {
	return settings.commandPrefix + ' ';
}

// Get the image when tts is IDLE.
function getIdleImage() {
  return document.querySelector('.image-idle img');
}

// Get the image when tts speaks.
function getSpeakImage() {
  return document.querySelector('.image-speak img');
}

// Shows speak image when tts starts.
function onSpeakStarts() {
  getSpeakImage().classList.remove('hidden');
  getIdleImage().classList.add('hidden');
}

// Hide speak image when tts stops.
function onSpeakEnds() {
  getSpeakImage().classList.add('hidden');
  getIdleImage().classList.remove('hidden');
  state.playing = false;
}

// Check if the text is safe to be played on tts.
function containsBannableWords(text) {
  for (var i in bannedWords) {
    if (typeof(bannedWords[i]) === 'string' && text.includes(bannedWords[i].toLowerCase())) {
      return true;
    }
  }
  return false;
}

// Setup all bad words downloading a list from github.
async function setupBadWords() {
  var spanishBadWords = await getBadWords('es');
  var englishBadWords = await getBadWords('en');
  bannedWords = bannedWords.concat(spanishBadWords.words).concat(englishBadWords.words)
}

// Fetch bad words.
// @todo consider using a custom source so we do not depend on external data.
async function getBadWords(langcode) {
  var url = "https://raw.githubusercontent.com/MoisesLaris/badwords-es/master/lib/languages/lang-" + langcode + ".json";
  return await get(url);
}

// Get data from specific URL.
async function get(URL) {
  return await fetch(URL)
    .then(async res => {
      if (!res.ok) return null
      return res.json()
    })
    .catch(error => null)
}
