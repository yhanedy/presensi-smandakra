// Konfigurasi Turso Database SMAN 2 Karanganyar
const TURSO_URL = "https://smada-db-yhanedy.aws-ap-southeast-2.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTM0NTg1MDQsImlkIjoiMDFhMTkyNzMtODIwMS03MGZkLWEzYjEtYmIwYTQ5NGU2YzQ5Iiwia2lkIjoieEFIcDc0WGZzOC1wbm56RVd5QjE3clJPamp4ZzBIZFhaQXRMM1BUWlZfdyIsInJpZCI6IjgyYWM0Yjk3LWMxYmYtNGEwYi04OTYxLTU5MTllMTE3N2FhNSJ9.wgV_tVcdN9c82TZkrHZiXM5QfnGre4h6sa02jOqayzphMSSdkBcGbqlzCdb5J-j7Sn7xB4pX4INWhQLgAvVSAw";

// Helper Function Query Direct ke Turso HTTP Pipeline API
async function queryTurso(sql, args = []) {
  const response = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql: sql,
            args: args.map(val => ({ type: "text", value: String(val) }))
          }
        },
        { type: "close" }
      ]
    })
  });

  const resData = await response.json();
  
  if (resData.results && resData.results[0]?.response?.type === 'execute') {
    const execResult = resData.results[0].response.result;
    const cols = execResult.cols.map(c => c.name);
    return execResult.rows.map(row => {
      let obj = {};
      row.forEach((cell, i) => {
        obj[cols[i]] = cell.value;
      });
      return obj;
    });
  }
  
  if (resData.results && resData.results[0]?.response?.type === 'error') {
    throw new Error(resData.results[0].response.error.message);
  }

  return [];
}
