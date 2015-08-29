#!/usr/bin/env node
'use strict';

/**
 * This file will kick off a single backup when config.backupInterval is not defined.  When it is
 * defined this file will set up the backup process to run at the specified interval.
 */
var later = require('later'),
  log4js = require('log4js'),

  config = require('./config.json'),
  backup = require('./lib/backup.js'),

  logger = log4js.getLogger('dog-watcher'),

  apiKey = config.dataDogApiKey,
  appKey = config.dataDogAppKey,
  repo = config.gitRepoForBackups,
  backupInterval = config.backupInterval,
  backupSchedule,

  /**
   * Make sure the config file has DataDog keys and a destination repo.
   */
  validateConfig = function() {
    if (!apiKey || !appKey) {
      logger.error('You must provide DataDog keys in the config.json file.');
      process.exit(1);
    }

    if (!repo) {
      logger.error('You must provide a git repo in the config.json file.');
      process.exit(1);
    }
  },

  backupCallback = function(error) {
    if (error) {
      logger.error('Backup failed.', error);
    } else {
      logger.debug('Backup complete.')
    }
  };

logger.setLevel(process.env.LOG_LEVEL || 'INFO');
validateConfig();

if (backupInterval) {
  backupSchedule = later.parse.cron(backupInterval);
  if (backupSchedule.error && backupSchedule !== -1) {
    logger.error('There was a problem parsing your interval [' + backupInterval + ']. Please ' +
      'make sure that this is a valid cron interval.', backupSchedule.error);
    process.exit(1);
  }
  logger.info('Scheduling backups to for ' + backupInterval);
  logger.debug(JSON.stringify(backupSchedule.schedules));
  later.setInterval(
    function() {
      backup(backupCallback);
    },
    backupSchedule
  )
} else {
  logger.info('Running a one-time backup.');
  backup(backupCallback);
}
