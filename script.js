async function loadCSV() {
  const response = await fetch("totalarticles.csv");

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const csvText = await response.text();

  Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,

    complete: function (results) {
      const rawData = results.data;

      if (!rawData.length) return;

      const cleanKeys = Object.keys(rawData[0]).map(k =>
        k.trim().replace(/^\uFEFF/, "")
      );

      // rebuild consistent dataset
      const cleanData = rawData.map(row => {
        const newRow = {};

        cleanKeys.forEach(key => {
          newRow[key] = row[key] ?? "";
        });

        return newRow;
      });

      createTable(cleanData, cleanKeys);
    }
  });
}

function createTable(data) {

  // Generate columns
  const columns = Object.keys(data[0]).map((key, index) => ({
    title: key,
    field: key,
    sorter: "string",

    widthGrow: 1,
    minWidth: 120,
    // Freeze first 2 columns
    frozen: index < 2
  }));

  // Create table
  const table = new Tabulator("#table", {

    data: data,

    layout: "fitColumns",

    pagination: true,
    paginationSize: 25,
    resizableColumns: true,
    columnDefaults: {
      resizable: true,
    },
    movableColumns: true,

    columns: columns
  });





}
loadCSV();