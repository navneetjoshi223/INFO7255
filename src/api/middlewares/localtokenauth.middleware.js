import { getKey, verifyToken } from './token-utils.js';

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token || !token.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized');
  }

  const idToken = token.split(' ')[1];

  try {
    const decodedToken = await verifyToken(idToken, getKey, {
      algorithms: ['RS256']
    });

    // Attach the decoded token to the request object
    req.user = decodedToken;

    next();
  } catch (error) {
    return res.status(401).send('Unauthorized');
  }
};

export default authMiddleware;
