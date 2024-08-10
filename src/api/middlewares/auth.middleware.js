import axios from 'axios';

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token || !token.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized');
  }

  const accessToken = token.split(' ')[1];
  const isValidUser = await validateUser(accessToken);

  if (!isValidUser) {
    return res.status(401).send('Unauthorized');
  }

  next();
};

const validateUser = async (token) => {
  try {
    await axios.get(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
    return true;
  } catch (error) {
    return false;
  }
};

export default authMiddleware;
