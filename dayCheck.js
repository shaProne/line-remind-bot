// dayCheck.js
const line  = require('@line/bot-sdk');
const admin = require('firebase-admin');

const appInst = admin.apps.length
  ? admin.app('remindApp')
  : admin.initializeApp(
      { credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIAL_B64,'base64'))
        ) },
      'remindApp'
    );

const db     = appInst.firestore();
const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

const dayjs = require('dayjs');
require('dayjs/plugin/utc');
require('dayjs/plugin/timezone');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

const todayKey  = () => dayjs().tz('Asia/Tokyo').format('YYYY-MM-DD');
const yestKey   = () => dayjs().tz('Asia/Tokyo').subtract(1,'day').format('YYYY-MM-DD');

module.exports = async (req, res) => {
  const yesterday = yestKey();
  const snap = await db.collection('users').where('status','==','READY').get();

  const tasks = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.rest?.[yesterday]) return;             // 休養日なら無視
    if ((d.report?.[yesterday] || []).length) return; // 何か報告あれば無視

    tasks.push(client.pushMessage(doc.id, {
      type:'text',
      text:`昨日（${yesterday}）の報告が提出されていませんでした😢`
    }));
  });

  await Promise.allSettled(tasks);
  res.status(200).json({ uncheckedNotice: tasks.length });
};