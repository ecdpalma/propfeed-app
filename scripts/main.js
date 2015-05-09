var args = require('yargs')
    .usage("Usage: $0 --load|-l [--delete|-d] [--archive|-a] [--tweet|-t] --from|-f <from date> --to|-t <to date>")
    .alias('load', 'l')
    .alias('camara', 'c')
    .alias('senado', 's')
    .alias('delete', 'd')
    .alias('archive', 'a')
    .alias('tweet', 'tw')
    .alias('from', 'f')
    .alias('to', 't')
    .argv;

var config = require('./config')
var httpClient = require('httpinvoke');
var moment = require('moment');
var today = moment();
var querystring = require('querystring');
var nano = require('nano')('http://localhost:5984');
var camara;
var senado;
var cookies = {};
var Twit = require('twit');
var twitter = new Twit({
    consumer_key: config.twitter.consumerKey,
    consumer_secret: config.twitter.consumerSecret,
    access_token: config.twitter.accessToken,
    access_token_secret:  config.twitter.accessTokenSecret
});

var ProposicaoOps = {};
var Proposicao;

twitter.get('help/configuration', function(error, data, response) {
    twitter.urlLength = data.characters_reserved_per_media;

    nano.auth(config.couchDb.username, config.couchDb.password, function(error, body, headers) {

        if (typeof error !== "undefined" && error !== null) {
            console.log("Invalid CouchDb username and/password");
            return;
        }

        if (typeof headers !== "undefined" && headers !== null && headers['set-cookie']) {
            cookies[""] = headers['set-cookie'];
        }

        nano = require('nano')({
            url: config.couchDb.host,
            cookie: cookies[''][0]
        });

        Proposicao = require('./proposicao')(nano.db.use('propfeed'));
        camara = require('./camara')(nano.db.use('propfeed'));
        senado = require('./senado')(nano.db.use('propfeed'))
        console.log("Logged in CouchDB");


        if (args.load) {
            if (args.camara) {
                camara.fetchSiglas().done(function(result) {
                    if (typeof result.siglas !== "undefined" && result.siglas !== null) {
                        config.camara.siglas = result.siglas;
                    }
                    camara.fetchProposicoes(config.camara.siglas, args.from, args.to)
                        .then(function(insertedProposicoes) {
                            if (args.tweet) {
                                Proposicao.tweet(twitter, insertedProposicoes)
                            }
                        });
                });
            }

            if (args.senado) {
                senado.fetchProposicoes(args.from, args.to).then(function(insertedProposicoes) {
                    if (args.tweet) {
                        Proposicao.tweet(twitter, insertedProposicoes);
                    }
                });
            }
        }
        else if (args.archive) {
            archiveProposicoes(args.from, args.to);
        }
        else if (args.delete) {
            deleteProposicoes(args.from, args.to);
        }
    });
});




var archiveProposicoes = function(type, from, to) {
    Proposicao.getCurrent(from, to).then(function(result) {
        console.log(result.proposicoes.length);
        Proposicao.archive(result.proposicoes).then(function(results) {
            results.forEach(function(result) {
                if (result.state === "rejected") {
                    console.log("Error archiving " + result.reason.proposicao.value._id + ": " + result.reason.error);
                }
                else {
                    console.log("Archived " + result.value.proposicao.value._id);
                }
            });
        });
    }).done();
}

var deleteProposicoes = function(from, to) {
    Proposicao.getCurrent(from, to).then(function(result) {
        console.log(result.proposicoes.length);
        Proposicao.destroy(result.proposicoes).then(function(results) {
            results.forEach(function(result) {
                if (result.state === "rejected") {
                    console.log("Error deleting " + result.reason.proposicao._id + ": " + result.reason.error);
                }
                else {
                    console.log("Deleted " + result.reason.proposicao._id);
                }
            });
        });

    }).done()
}

