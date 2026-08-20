const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauthController');

router.post('/google', oauthController.google);

module.exports = router;