/**********************
 *  必要モジュール
 **********************/
const express = require('express');
const line    = require('@line/bot-sdk');
const admin   = require('firebase-admin');
const dayjs   = require('dayjs');

require('dayjs/locale/ja');
require('dayjs/plugin/utc');
require('dayjs/plugin/timezone');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

/**********************
 *  Firebase 初期化
 **********************/
let firebaseApp;

if (admin.apps.length === 0) {
  const credB64 = process.env.FIREBASE_CREDENTIAL_B64;
  if (!credB64) {
    throw new Error('FIREBASE_CREDENTIAL_B64 が設定されていません');
  }

  const credJson = Buffer.from(credB64, 'base64').toString('utf8');
  const cred = JSON.parse(credJson);

  firebaseApp = admin.initializeApp(
    { credential: admin.credential.cert(cred) },
    'remindApp'
  );
} else {
  firebaseApp = admin.app('remindApp');
}

const db = firebaseApp.firestore();

/**********************
 *  LINE SDK 設定
 **********************/
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret:      process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);
const app    = express();

/**********************
 *  日付キーヘルパ
 **********************/
const dateKey = () => {
  const now = dayjs().tz('Asia/Tokyo');
  return now.hour() < 4
    ? now.subtract(1, 'day').format('YYYY-MM-DD')
    : now.format('YYYY-MM-DD');
};

const studyDateKey = (d = dayjs()) => {
  const t = d.tz('Asia/Tokyo');
  const base = t.hour() < 4 ? t.subtract(1, 'day') : t;
  return base.format('YYYY-MM-DD');
};

/**********************
 *  Webhook エンドポイント
 **********************/
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).send('OK');
  } catch (e) {
    console.error('handleEvent error', e);
    res.status(500).send('Error');
  }
});

// 動作確認用（ブラウザで / を開いたとき）
app.get('/', (req, res) => {
  res.status(200).send('LINE Remind Bot is running.');
});

/**********************
 *  メインのイベント処理
 **********************/
async function handleEvent(event) {
  const uid = event.source.userId;

  // 友だち追加
  if (event.type === 'follow') {
    const userRef = db.collection('users').doc(uid);
    await userRef.set({ status: 'WAIT_COUNT' }, { merge: true });

    return reply(
      event,
      '鉄壁の学習サポート、私がして差し上げます。毎日、取り組むセクションの数を数字で申告してください。余計な文字などは不要です。'
    );
  }

  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text.trim();
  const userRef  = db.collection('users').doc(uid);
  const doc      = await userRef.get();
  const user     = doc.exists ? doc.data() : {};

  /***** ① 初回：セクション数登録 *****/
if (user.status === 'WAIT_COUNT') {
  if (/^\d+$/.test(text)) {
    const today = dateKey();
    await userRef.set(
      {
        dailyTarget: Number(text),
        status: 'READY',
        report: {
          [today]: []   // 今日のカウントをリセット
        }
      },
      { merge: true }
    );
    return reply(
      event,
      `承知いたしました。一日${text}セクションですね？この私が一緒にやるのですから、決して怠けないように。`
    );
  }
  return reply(event, '数字で申告を、と言いましたわよね？指示に従いなさい。');
}
  /***** ② 通常運用（READY 時） *****/
  if (user.status === 'READY') {
    // 休養日
    if (text === '休養日') {
      const key = studyDateKey();
      await userRef.set({ [`rest.${key}`]: true }, { merge: true });

      return reply(
        event,
        'わかりました、今日は休みなさい。誰にでも調子の出ない日はあります。ですが明日は倍にして返しなさい。もちろん分かってますよね？'
      );
    }

    // 数字だけのメッセージ
    if (/^\d+$/.test(text)) {
      const num = Number(text);

      if (num < 1 || num > 50) {
        return reply(
          event,
          '鉄壁はセクション50までだったと記憶しております。どういうつもりでしょうか？'
        );
      }

      const today = dateKey();
      const data = user || {};

      const currentArr = (data.report?.[today] || []).slice();
      currentArr.push(num);

      await userRef.set(
        {
          report: {
            ...(data.report || {}),
            [today]: currentArr
          }
        },
        { merge: true }
      );

      const target = data.dailyTarget || 3;
      const len = currentArr.length;

      if (len < target) {
        return reply(
          event,
          `報告、ご苦労さまです。その調子で続けなさい。（${len}/${target}）`
        );
      } else if (len === target) {
        return reply(
          event,
          '本日の目標、しっかりと達成できましたね。努力を積み重ねる姿勢は評価に値します。引き続き、この調子で取り組みなさい。'
        );
      } else {
        return reply(
          event,
          'さらに頑張ったのですね。少し見直しました。その調子で励んでください。'
        );
      }
    }

    // 数字が入っているが、数字だけではない
    if (/\d/.test(text)) {
      return reply(
        event,
        '数字のみで報告、と言ったはずです。指示に従いなさい。'
      );
    }
  }

  // それ以外は特に何もしない
  return;
}

/**********************
 *  返信ヘルパ
 **********************/
function reply(event, text) {
  return client.replyMessage(event.replyToken, { type: 'text', text });
}

/**********************
 *  Vercel では app を export
 **********************/
module.exports = app;
