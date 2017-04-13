const Sequelize = require('sequelize');

const init = (dbfile) => {
  const db = new Sequelize('database', '', '', {
    dialect: 'sqlite',
    storage: dbfile
  });

  const Indexes = db.define('indexes', {
    ssid: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    index: {
      type: Sequelize.INTEGER
    }
  });
  Indexes.sync();
  return Indexes;
};

module.exports = init;
