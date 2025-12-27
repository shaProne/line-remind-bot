/**********************
 *  必要モジュール
 **********************/
const express = require('express');
const line    = require('@line/bot-sdk');
const admin   = require('firebase-admin');

/**********************
 *  Firebase 初期化
 **********************/
let firebaseApp;

if (admin.apps.length === 0) {
  const cred = JSON.parse(
    Buffer.from(process.env.FIREBASE_CREDENTIAL_B64, 'base64')
  );
  firebaseApp = admin.initializeApp(
    { credential: admin.credential.cert(cred) },
    'remindApp'                    // ← 固有名を付けて重複回避
  );
} else {
  firebaseApp = admin.app('remindApp'); // ← 既存 App を再利用
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
 *  日付キーを JST4:00 起点で作るヘルパ
 **********************/
const dayjs = require('dayjs');
require('dayjs/locale/ja');
require('dayjs/plugin/utc');
require('dayjs/plugin/timezone');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

const dateKey = () => {
  const now = dayjs().tz('Asia/Tokyo');
  return now.hour() < 4 ? now.subtract(1, 'day').format('YYYY-MM-DD')
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
  await Promise.all(req.body.events.map(handleEvent));
  res.status(200).send('OK');
});

/**********************
 *  メインのイベント処理
 **********************/
async function handleEvent(event) {
  const uid = event.source.userId;

  /***** 友だち追加イベント *****/
  if (event.type === 'follow') {
    await db.collection('users').doc(uid).set({ status: 'WAIT_COUNT' });
    return reply(event, '鉄壁の学習サポート、私がして差し上げます。毎日、やったセクションを数字で報告なさい。余計な絵文字などは不要です。');
  }

  /***** テキストメッセージのみ処理 *****/
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text.trim();
  const ref  = db.collection('users').doc(uid);
  const doc  = await ref.get();
  const user = doc.exists ? doc.data() : {};

  /***** ① 初回：セクション数登録 *****/
  if (user.status === 'WAIT_COUNT') {
    if (/^\d+$/.test(text)) {
      await ref.set({ dailyTarget: Number(text), status: 'READY' }, { merge: true });
      return reply(event, `承知いたしました。一日${text}ですね？この私が一緒にやるのですから、決して怠けないように。`

      );
    }
    return reply(event, '数字で申告を、と言いましたわよね？指示に従いなさい。');
  }

  /***** ② 通常運用（READY 時） *****/
  if (user.status === 'READY') {
    if (text === '休養日') {
      const key = studyDateKey(); // ← 4:00 区切りの「勉強日」

      await ref.set({ [`rest.${key}`]: true }, { merge: true });

      return reply(
        event,
        'わかりました、今日は休みなさい。誰にでも調子の出ない日はあります。ですが明日は倍にして返しなさい。もちろん分かってますよね？'
    );
    }
    if (/^\d+$/.test(text)) {
      const num = Number(text);
    
      // 🔴 範囲外チェック
      if (num < 1 || num > 50) {
        return reply(event, '鉄壁はセクション50までだったと記憶しております。どういうつもりでしょうか？');
      }
    
      // 🟢 正常な自然数なら続行
      const today = dateKey();
      const ref = db.collection('users').doc(uid);
    
      const snap = await ref.get();
      const data = snap.data() || {};
    
      const currentArr =
        (data.report && data.report[today]) ? [...data.report[today]] : [];
    
      currentArr.push(num);
    
      await ref.set({
        report: {
          [today]: currentArr
        }
      }, { merge: true });
    
      const target = data.dailyTarget || 3;
      const len = currentArr.length;
    
      if (len < target) {
        return reply(event, `報告、ご苦労さまです。その調子で続けなさい。（${len}/${target}）`);
      } else if (len === target) {
        return reply(event, '本日の目標、しっかりと達成できましたね。努力を積み重ねる姿勢は評価に値します。引き続き、この調子で取り組みなさい。');
      } else {
        return reply(event, '頑張りましたね。少し見直しました。その調子で励みなさい。');
      }
    } else if (/\d/.test(text)) {
      // 🟥 「数字が含まれてるけど自然数単体じゃない」パターン
      return reply(event, '数字のみで報告、と言ったはずです。指示に従いなさい。');
    }

}
}

/**********************
 *  返信ヘルパ
 **********************/
function reply(event, text) {
  return client.replyMessage(event.replyToken, { type: 'text', text });
}

/**********************
 *  remind.js の統合
 **********************/
const remindApp = require('./remind');
app.use(remindApp);

/**********************
 *  ローカル確認用サーバ
 **********************/
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});