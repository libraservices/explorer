var express = require('express');
var viewRoutes = require('./view');
var apiRoutes = require('./api');
var extRoutes = require('./extended');
var router = express.Router();

router.use('/', viewRoutes);
router.use('/api', apiRoutes);
router.use('/ext', extRoutes);

module.exports = router;
