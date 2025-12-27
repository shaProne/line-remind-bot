// remind22.js
const line  = require('@line/bot-sdk');
const admin = require('firebase-admin');

const app = admin.apps.length
  ? admin.app('remindApp')
  : admin.initializeApp(
      { credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIAL_B64,'base64'))
        )},
      'remindApp'
    );

const db = app.firestore();
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

const dayjs = require('dayjs');
require('dayjs/plugin/utc');
require('dayjs/plugin/timezone');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

const dateKey = () => {
  const now = dayjs().tz('Asia/Tokyo');
  return now.hour() < 4 ? now.subtract(1,'day').format('YYYY-MM-DD')
                        : now.format('YYYY-MM-DD');
};


const studyDateKey = (d = dayjs()) => {
  const t = d.tz('Asia/Tokyo');
  const base = t.hour() < 4 ? t.subtract(1, 'day') : t;
  return base.format('YYYY-MM-DD');
};


module.exports = async (req, res) => {
  const today = dateKey();
  const snap  = await db.collection('users').where('status','==','READY').get();
  const tasks = [];

snap.forEach(doc => {
  const d = doc.data();
  const target = d.dailyTarget || 3;

  // ★ ここを修正：Flatten された rest.日付 を見る
  const restFieldName = `rest.${today}`;
  if (d[restFieldName]) return;

  if ((d.report?.[today] || []).length >= target) return;
  
  tasks.push(client.pushMessage(doc.id, {
    type:'text',
    text:'本日の報告、お待ちしております。終わったら教えてくださいね。'
  }));
});


  await Promise.allSettled(tasks);
  res.status(200).json({ remind22Sent: tasks.length });
};
