const info = document.getElementById('info');
grist.ready();

grist.onRecords((records) => {
  if (!records || !records.length) {
    info.textContent = "No record selected.";
    return;
  }
  const record = records[0];
  info.textContent = `Record ID: ${record.id}`;
});
