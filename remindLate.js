// remindLate.js
const line   = require('@line/bot-sdk');
const admin  = require('firebase-admin');

let appInstance;
if (!admin.apps.length) {
  const cred = JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIAL_B64, 'base64'));
  appInstance = admin.initializeApp({ credential: admin.credential.cert(cred) }, 'remindApp');
} else {
  appInstance = admin.app('remindApp');
}
const db = appInstance.firestore();

const client = new line.Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

const dayjs = require('dayjs');
require('dayjs/plugin/timezone');
require('dayjs/plugin/utc');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

const dateKey = () => {
  const now = dayjs().tz('Asia/Tokyo');
  return now.hour() < 4 ? now.subtract(1, 'day').format('YYYY-MM-DD')
                        : now.format('YYYY-MM-DD');
};

module.exports = async (req, res) => {
  const today = dateKey();
  const snap  = await db.collection('users').where('status', '==', 'READY').get();

  const tasks = [];
  snap.forEach(doc => {
    const d = doc.data();
    const hadRest = d.rest?.[today];
    const reports = d.report?.[today] || [];
    if (hadRest) return;                // 休養日は除外
    if (reports.length >= 3) return;    // 既に完了している人は除外

    const remain = 3 - reports.length;
    const msg = {
      type : 'text',
      text : `23:30です！残り ${remain} 件の報告がまだです📣`
    };
    tasks.push(client.pushMessage(doc.id, msg));
  });

  await Promise.allSettled(tasks);
  res.status(200).json({ lateRemindSent: tasks.length });
};