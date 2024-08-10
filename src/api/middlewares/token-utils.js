import pkg from 'jsonwebtoken';
import axios from 'axios';

const { verify } = pkg;

let cachedKeys;

const getGooglePublicKeys = async () => {
  if (!cachedKeys) {
    const res = await axios.get('https://www.googleapis.com/oauth2/v3/certs');
    cachedKeys = res.data.keys;
  }
  return cachedKeys;
};

const getKey = async (header, callback) => {
  const keys = await getGooglePublicKeys();
  const key = keys.find(k => k.kid === header.kid);
  if (key) {
    callback(null, key);
  } else {
    callback(new Error('Key not found'));
  }
};

const verifyToken = (token, getKey, options) => {
  return new Promise((resolve, reject) => {
    verify(token, getKey, options, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
};

export { getKey, verifyToken };
