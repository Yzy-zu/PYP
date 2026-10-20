const mysql = require('mysql2/promise');
const config = require('../config/env');

const pool = mysql.createPool(config.db);

module.exports = pool;
