/**
 * react-native-audio-api logs a harmless console.warn when the iOS
 * RecordingNotificationManager stub loads. Strip it after install so Metro
 * stays quiet (the API is intentionally a no-op on iOS).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const replacements = [
  {
    file: 'node_modules/react-native-audio-api/src/system/notification/RecordingNotificationManager.ios.ts',
    from: `    this.audioEventEmitter = new AudioEventEmitter(global.AudioEventEmitter);
    console.warn(
      'RecordingNotificationManager is not implemented on iOS. Any calls to it will be no-ops.'
    );
`,
    to: `    this.audioEventEmitter = new AudioEventEmitter(global.AudioEventEmitter);
`,
  },
  {
    file: 'node_modules/react-native-audio-api/lib/module/system/notification/RecordingNotificationManager.ios.js',
    from: `    this.audioEventEmitter = new AudioEventEmitter(global.AudioEventEmitter);
    console.warn('RecordingNotificationManager is not implemented on iOS. Any calls to it will be no-ops.');
`,
    to: `    this.audioEventEmitter = new AudioEventEmitter(global.AudioEventEmitter);
`,
  },
  {
    file: 'node_modules/react-native-audio-api/lib/commonjs/system/notification/RecordingNotificationManager.ios.js',
    from: `    this.audioEventEmitter = new _events.AudioEventEmitter(global.AudioEventEmitter);
    console.warn('RecordingNotificationManager is not implemented on iOS. Any calls to it will be no-ops.');
`,
    to: `    this.audioEventEmitter = new _events.AudioEventEmitter(global.AudioEventEmitter);
`,
  },
];

for (const { file, from, to } of replacements) {
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) continue;
  let text = fs.readFileSync(fp, 'utf8').replace(/\r\n/g, '\n');
  if (!text.includes('RecordingNotificationManager is not implemented on iOS'))
    continue;
  if (!text.includes(from)) continue;
  fs.writeFileSync(fp, text.replace(from, to), 'utf8');
}
