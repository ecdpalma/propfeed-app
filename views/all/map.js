function map(doc) {
    emit([new Date(doc.date).getFullYear(),
        new Date(doc.date).getMonth() + 1,
        new Date(doc.date).getDate()], doc);
}
