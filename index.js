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
    return reply(event, 'こんにちは！毎日いくつのセクションを進めますか？数字で教えてください！');
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
      return reply(event, `登録しました！目標は 1日 ${text} セクションですね📚`);
    }
    return reply(event, '数字で教えてください🙏');
  }

  /***** ② 通常運用（READY 時） *****/
  if (user.status === 'READY') {
    if (text === '休養日') {
      await ref.set({ [`rest.${dateKey()}`]: true }, { merge: true });
      return reply(event, '了解です！今日はゆっくり休んでください😊');
    }
/***** 数字メッセージ *****/
if (/^\d+$/.test(text)) {
  const today     = dateKey();                // 例: 2024-06-07
  const fieldPath = `report.${today}`;        // ネストキー
  const num       = Number(text);

  // ① 常に最新のドキュメントを取得
  const freshSnap = await ref.get();
  const freshData = freshSnap.data() || {};

  // ② 現在の配列（存在しなければ []）
  const currentArr = freshData.report?.[today] || [];

  // ③ 既に送られた数字と重複しないように追加
  const updatedArr = [...currentArr, num];

  // ④ Firestoreに上書き保存
  await ref.set({ [fieldPath]: updatedArr }, { merge: true });

  // ⑤ 目標値と比較して応答
  const target = freshData.dailyTarget || 3;        // 必ず数値
  const newLen = updatedArr.length;

  if (newLen < target) {
    return reply(event, `記録しました！（${newLen}/${target}）`);
  } else if (newLen === target) {
    return reply(event, '今日の鉄壁はこれで完了ですね！お疲れさまでした💮');
  } else {
    return reply(event, 'さらにやったんですか！？すごい！');
  }
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