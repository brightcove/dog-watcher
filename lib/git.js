'use strict';

module.exports = config => {

  /**
   * Simple wrapper for git.
   */
  var
    spawn = require('child_process').spawn,
    log4js = require('log4js'),
    logger = log4js.getLogger('dog-watcher'),

    GIT_NOOP_MESSAGE = config.noopEventMessage || 'Git output indicates a noop.',
    NOOP_INDICATORS = ['no changes added to commit', 'nothing to commit'],

    /**
     * Performs a git command from the specified work directory.
     * @param args Array of params to pass to git that includes the git action.
     * @param workdir The cwd to use.
     * @param callback function(error, outputDir).  Output dir is passed to make chaining calls easier.
     */
    runCommand = function(args, workDir, callback) {
      var gitProcess,
        callbackCalled,
        output = '',
        options,
        callCallbackOnce = function(error) {
          if (!callbackCalled) {
            callbackCalled = true;
            callback(error, workDir);
          }
        };

      if (workDir) {
        options = { cwd: workDir };
      }
      gitProcess = spawn('git', args, options);
      gitProcess.stdout.on('data', function(data) {
        output += data;
      });
      gitProcess.stderr.on('data', function(data) {
        output += data;
      });
      gitProcess.on('close', function(code) {
        var noop;
        if (NOOP_INDICATORS) {
          NOOP_INDICATORS.forEach(function (noopIndicator, index, all) {
            if (output.indexOf(noopIndicator) >= 0) {
              noop = new Error(GIT_NOOP_MESSAGE);
            }
          });
        }
        logger.debug(output);
        callCallbackOnce(noop);
      });
      gitProcess.on('error', function(code) {
        logger.error('Error on git process: ' + code);
        logger.error(output);
        callCallbackOnce(code);
      });
    };

  logger.level = process.env.LOG_LEVEL || 'INFO';

  return {
    GIT_NOOP_MESSAGE: GIT_NOOP_MESSAGE,
    runCommand: runCommand
  };
};
