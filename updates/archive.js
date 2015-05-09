function archive(doc, req) {
    if (doc) {
        doc.archived = true;
        return [doc, "Archived"];
    }
    else {
        return [null, "Failed"];

    }
}
