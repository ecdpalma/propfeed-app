function atom(head, req){
    var ddoc = this;

    var rows = [];
    var Mustache = require("vendor/mustache");
    var atomView = {
        "id": "http://propfeedbr.org/",
        "title": "PropFeed-BR",
        "subtitle": "Banana Props",
        "language": "",
        "selfLink": "http://localhost:5984/propfeed/_design/propfeed-app/_list/atom/all",
        "currentLink": "http://localhost:5984/propfeed/_design/propfeed-app/_rewrite/current",
        "description": "Proposições apresentadas à Câmara dos Deputados do Brasil",
        "updated": new Date().toISOString(),
        "author": "author",
        "explicit": "no",
        "ownerName": "Owner Name",
        "ownerEmail": "owneremail@ownerdomain.com"
    };

    var buildUrl = function(date) {
        return "http://localhost:5984/propfeed/_design/propfeed-app/_rewrite/archive/" +
            date.getFullYear() + "/" +
            (date.getMonth() + 1) + "/" +
            date.getDate() + "/";

    }

    var buildPrevArchiveUrl = function(date) {
        var previousDate = addDays(date, -1);
        return buildUrl(previousDate);
    };

    var buildNextArchiveUrl = function(date) {
        var currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        var nextDate = addDays(requestedDate, 1);
        if (nextDate >= currentDate) {
            return "http://localhost:5984/propfeed/_design/propfeed-app/_rewrite/current"
        }
        else {
            return buildUrl(nextDate);
        }
    };

    var addDays = function(date, days) {
        var result = new Date(date);
        result.setDate(date.getDate() + days);
        return result;
    };

    var buildCamaraEntry = function(row) {
        return {
            "id": "tag:propfeebr.org,2015:" + row.value._id,
            "title": row.value.data.nome,
            "summary": row.value.data.tipoProposicao.nome,
            "link": "http://www.camara.gov.br/proposicoesWeb/fichadetramitacao?idProposicao=" + row.value.data.id,
            "content": row.value.data.txtEmenta,
            "updated": row.value.date,
            "author?": function() {
                if (row.value.data.autor1) {
                    return {
                        "name": row.value.data.autor1.txtNomeAutor.trim(),
                        "party": row.value.data.autor1.txtSiglaPartido.trim(),
                        "state": row.value.data.autor1.txtSiglaUF.trim()
                    }
                }
            }
        }
    };

    var buildSenadoEntry = function(row) {
        return {
            "id": "tag:propfeebr.org,2015:" + row.value._id,
            "title": row.value.data.IdentificacaoMateria.SiglaSubtipoMateria + " " +
                row.value.data.IdentificacaoMateria.NumeroMateria + "/" + row.value.data.IdentificacaoMateria.AnoMateria,
            "summary": row.value.data.IdentificacaoMateria.DescricaoSubtipoMateria,
            "link": "http://www.senado.gov.br/atividade/materia/detalhes.asp?p_cod_mate=" + row.value.data.IdentificacaoMateria.CodigoMateria,
            "content": row.value.data.DadosBasicosMateria.EmentaMateria,
            "updated": row.value.date,
            "author?": function() {
                var autor;
                if (row.value.data.Autoria) {
                    if (isArray(row.value.data.Autoria.Autor)) {
                        autor = row.value.data.Autoria.Autor[0];
                    }
                    else {
                        autor = row.value.data.Autoria.Autor;
                    }
                    if (autor.IdentificacaoParlamentar) {
                        return {
                            "name": autor.IdentificacaoParlamentar.NomeParlamentar,
                            "party": autor.IdentificacaoParlamentar.SiglaPartidoParlamentar,
                            "state": autor.IdentificacaoParlamentar.UfParlamentar
                        }
                    }
                    else {
                        return {
                            "name": autor.NomeAutor
                        }
                    }
                }
            }
        }
    }

    if (req.raw_path.indexOf("_list/atom/current") != -1) {
        var currentDate = new Date();
        atomView.prevArchive = buildPrevArchiveUrl(currentDate);
        log("prevLink: " + atomView.prevArchive);
    }
    else if (req.raw_path.indexOf("_list/atom/archive") != -1) {
        var requestedDate = new Date(req.query.year, req.query.month - 1, req.query.day);
        atomView.prevArchive = buildPrevArchiveUrl(requestedDate);
        atomView.nextArchive = buildNextArchiveUrl(requestedDate);

        log("prevLinkprev: " + atomView.prevArchive);
        log("nextLinkprev: " + atomView.nextArchive);

    }

    provides("atom", function(){
        while(row = getRow()) {
            var entry;
            if (row.value._id.charAt(0) == "C") {
                entry = buildCamaraEntry(row);
            }
            else if (row.value._id.charAt(0) == "S") {
                entry = buildSenadoEntry(row);
            }

            if (typeof entry !== "undefined" && entry !== null) {
                rows.push(entry);
            }
        }
        atomView["entries"] = rows;
        var xml = Mustache.to_html(ddoc.templates.atom, atomView);
        return xml;
    });


}

