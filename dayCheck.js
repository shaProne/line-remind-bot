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

/**
 * 4:00 区切りの「勉強日キー」を返す
 * d が省略されたら「今」の勉強日
 */
const studyDateKey = (d = dayjs()) => {
  const t = d.tz('Asia/Tokyo');
  const base = t.hour() < 4 ? t.subtract(1, 'day') : t;
  return base.format('YYYY-MM-DD');
};

const todayKey = () => studyDateKey();

/**
 * 「昨日の勉強日キー」
 * 4:00 の dayCheck から見て、1 日前の勉強日
 */
const yestKey = () => {
  const now = dayjs().tz('Asia/Tokyo');
  const y = now.subtract(1, 'day');
  return studyDateKey(y);
};


module.exports = async (req, res) => {
  const yesterday = yestKey();
  const snap = await db.collection('users').where('status','==','READY').get();

  const tasks = [];
  snap.forEach(doc => {
    const d = doc.data();

    // ★ 休養日チェック（rest は map 前提）
  const restFieldName = `rest.${yesterday}`;
  if (d[restFieldName]) return;
    

    // ★ 報告あればスキップ
    if ((d.report?.[yesterday] || []).length) return;

    tasks.push(client.pushMessage(doc.id, {
      type:'text',
      text:`昨日、報告が確認できませんでした。あなたが努力を怠ると、誰よりも早く成績に出ます。本日は必ず達成し、報告しなさい。`
    }));
  });

  await Promise.allSettled(tasks);
  res.status(200).json({ uncheckedNotice: tasks.length });
};