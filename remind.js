/**********************
 *  必要モジュール
 **********************/
const express = require('express');
const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

/**********************
 *  Firebase 初期化
 **********************/
let firebaseApp;
if (!admin.apps.length) {
  const cred = JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIAL_B64, 'base64'));
  firebaseApp = admin.initializeApp({ credential: admin.credential.cert(cred) }, 'remindApp');
} else {
  firebaseApp = admin.app('remindApp');
}
const db = firebaseApp.firestore();

/**********************
 *  LINE SDK 設定
 **********************/
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};
const client = new line.Client(config);

/**********************
 *  Expressルーティング
 **********************/
const app = express();

app.get('/remind/21', async (req, res) => {
  try {
    const snapshot = await db.collection('users').where('status', '==', 'READY').get();
    const messages = [];

    for (const doc of snapshot.docs) {
      const userId = doc.id;
      const msg = {
        type: 'text',
        text: 'お疲れさまです！今日の学習報告、まだでしたらぜひご記入ください✍️（最大3つまでOKです）'
      };
      messages.push(client.pushMessage(userId, msg));
    }

    await Promise.all(messages);
    res.status(200).send(`Sent reminders to ${messages.length} users`);
  } catch (e) {
    console.error('Error sending reminders:', e);
    res.status(500).send('Reminder failed');
  }
});

module.exports = app;