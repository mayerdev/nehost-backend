const db = require('dc-api-mongo').connect();

(async () => {
    await db.User.updateMany({}, { credit_limit: 0, dogovor: { accepted: false } });
    process.exit(0);
})();