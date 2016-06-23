'use strict';

const SilenceJS = require('silence-js');
const redis = require('redis');

class RedisSessionStore extends BaseSessionStore {
  constructor(config, logger) {
    super(logger);
    let me = this;

    this.redisClient = redis.createClient(config.port, config.host);
    redis.debug_mode = config.debug || false;

    this.redisClient.on('error', function(err) {
      me.logger.error('redis error: %s', err.toString());
    });
    this.redisClient.on('ready', function() {
      me._resolve('ready');
    });
  }
  get(sessionId) {
    let redis = this.redisClient;
    let logger = this.logger;
    logger.debug('try get sessionId: ' + sessionId);
    return new Promise((resolve, reject) => {
      ////每取一次都重新更新过期时间，保证用户每次刷新页面都可以延迟登录过期时间。
      redis.get(sessionId, function(err, result) {
        if (err) {
          reject(err);
          return;
        }
        if (!result) {
          resolve(null);
          return;
        }
        let user;
        try {
          user = JSON.parse(result);
        } catch(e) {
          reject(e);
          return;
        }
        logger.debug(`get redis session of '${sessionId}': ${result}`);
        redis.expire(sessionId,
          user.remember === true ? LONG_EXPIRE_TIME : EXPIRE_TIME,
          function (err) {
            if (err) {
              logger.error(`redis [expire] error: ${err.message}`);
            }
          }
        );
        resolve(user);
      });

    });
  }
  set(sessionId, sessionUser) {
    let redis = this.redisClient;
    let logger = this.logger;
    logger.debug('try set sessionId' + sessionId);
    return new Promise((resolve, reject) => {
      redis.setex([sessionId, sessionUser.remember ? LONG_EXPIRE_TIME : EXPIRE_TIME,
        JSON.stringify(sessionUser)], err => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }
  close() {
    this.redisClient.end();
  }
}

module.exports = RedisSessionStore;