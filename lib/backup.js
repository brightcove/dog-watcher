'use strict';
/**
 * The backup coordinator.  This module strings together all of the necessary actions to do a full
 * backup.
 */
var async = require('async'),
  temp = require('temp'),
  log4js = require('log4js'),

  config = require('../config.json'),
  dataDog = require('./dataDog.js'),
  git = require('./git.js'),
  logger = log4js.getLogger('dog-watcher'),

  workDir,

  /**
   * Perform the backup.  At the end if there was a successful backup or a failure send an event.
   * @param callback function(error)
   */
  run = function(callback) {

    async.waterfall(
      [
        async.apply(temp.mkdir, 'dog-watcher-work'),
        function(dir, next) {
          workDir = dir;
          git.runCommand(['clone', config.gitRepoForBackups, workDir], workDir, next);
        },
        async.apply(dataDog.getBoards, 'dash'),
        async.apply(dataDog.getBoards, 'screen'),
        async.apply(dataDog.getMonitors),

        async.apply(git.runCommand, ['add', '.']),
        async.apply(git.runCommand, ['commit', '-m', 'Automatically committed by dog-watcher script']),
        async.apply(git.runCommand, ['push', 'origin', 'master']),
        async.apply(temp.cleanup)
      ],
      function(error, cleanupResults) {
        var success,
          eventErrorMessage;
        if (error && error.message ===  git.GIT_NOOP_MESSAGE) {
          logger.info('There was nothing new to commit.');
          if (config.sendEventOnNoop !== 'true') {
            logger.info('No DataDog event was sent.');
            return callback();
          }
          eventErrorMessage = error.message;
          // not a real error.  Get rid of it.
          error = undefined;

        } else if (error) {
          logger.error('There was an error during the backup attempt.', error);
          success = false;
          eventErrorMessage = error.message;

        } else {
          success = true;
        }
        if (cleanupResults) {
          console.log({cleanupResults: cleanupResults});
        }
        dataDog.sendDataDogEvent(success, eventErrorMessage, function() {
          logger.debug('Event sent.');
          callback(error);
        })
      });
  };

temp.track();

logger.setLevel(process.env.LOG_LEVEL || 'INFO');

module.exports = run;
