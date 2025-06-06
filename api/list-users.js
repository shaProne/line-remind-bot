import admin from 'firebase-admin';

const appInst = admin.apps.length
  ? admin.app('remindApp')
  : admin.initializeApp(
      { credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_CREDENTIAL_B64,'base64'))
        ) },
      'remindApp'
    );

const db = appInst.firestore();

export default async function handler(req, res) {
  const snap = await db.collection('users').get();
  const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  res.status(200).json(users);
}