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

module.exports = async (req, res) => {
  const today = dateKey();
  const snap  = await db.collection('users').where('status','==','READY').get();
  const tasks = [];

  snap.forEach(doc => {
    const d = doc.data();
    const target = d.dailyTarget || 3;
  
    if (d.rest?.[today]) return;
    if ((d.report?.[today] || []).length >= target) return;
  
    tasks.push(client.pushMessage(doc.id, {
      type:'text',
      text:'アーニャ　今日の報告　待ってるます　一緒に　頑張るます！'
    }));
  });

  await Promise.allSettled(tasks);
  res.status(200).json({ remind22Sent: tasks.length });
};
