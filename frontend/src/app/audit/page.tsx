export default function AuditDashboard() {
  return (
    <main className="flex min-h-screen flex-col items-center p-10 gap-6">
      <h1 className="text-3xl font-bold">Audit Dashboard</h1>
      <form id="filters" className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-5xl">
        <input name="userId" placeholder="User ID" className="border p-2 rounded" />
        <input name="action" placeholder="Action" className="border p-2 rounded" />
        <input name="eventType" placeholder="Event Type" className="border p-2 rounded" />
        <input name="resource" placeholder="Resource" className="border p-2 rounded" />
        <input name="resourceId" placeholder="Resource ID" className="border p-2 rounded" />
        <input name="requestId" placeholder="Request ID" className="border p-2 rounded" />
        <input name="from" type="datetime-local" className="border p-2 rounded" />
        <input name="to" type="datetime-local" className="border p-2 rounded" />
        <button type="button" id="search" className="col-span-2 md:col-span-1 bg-blue-600 text-white p-2 rounded">Search</button>
        <button type="button" id="export" className="col-span-2 md:col-span-1 bg-gray-700 text-white p-2 rounded">Export CSV</button>
        <button type="button" id="anchor" className="col-span-2 md:col-span-1 bg-emerald-600 text-white p-2 rounded">Anchor to IPFS</button>
      </form>
      <div className="w-full max-w-5xl overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Timestamp</th>
              <th className="p-2">User</th>
              <th className="p-2">Action</th>
              <th className="p-2">Type</th>
              <th className="p-2">Resource</th>
              <th className="p-2">Outcome</th>
              <th className="p-2">Anchor</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <script dangerouslySetInnerHTML={{__html: `
        async function fetchLogs(params){
          const qs = new URLSearchParams(params).toString();
          const resp = await fetch('/audit/search?' + qs);
          return (await resp.json()).logs;
        }
        function readFilters(){
          const fd = new FormData(document.getElementById('filters'));
          const obj = {};
          for (const [k,v] of fd.entries()) if (v) obj[k]=v;
          return obj;
        }
        function escapeHtml(str){
          return String(str).replace(/[&<>"']/g, function(m){
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]);
          });
        }
        function renderRows(logs){
          const tbody = document.getElementById('rows');
          tbody.innerHTML = logs.map(function(l){
            return '<tr class="border-b">'
              + '<td class="p-2">' + new Date(l.timestamp).toLocaleString() + '</td>'
              + '<td class="p-2">' + (l.userId || '') + '</td>'
              + '<td class="p-2">' + escapeHtml(l.action) + '</td>'
              + '<td class="p-2">' + escapeHtml(l.eventType) + '</td>'
              + '<td class="p-2">' + (l.resource ? escapeHtml(l.resource) : '') + '</td>'
              + '<td class="p-2">' + escapeHtml(l.outcome) + '</td>'
              + '<td class="p-2">' + (l.anchorCid ? ('<a href="/ipfs/gateway?cid=' + encodeURIComponent(l.anchorCid) + '" target="_blank">CID</a>') : '') + '</td>'
              + '</tr>';
          }).join('');
        }
        document.getElementById('search').addEventListener('click', async function(){
          const logs = await fetchLogs(readFilters());
          renderRows(logs);
        });
        document.getElementById('export').addEventListener('click', async function(){
          const qs = new URLSearchParams(readFilters()).toString();
          const resp = await fetch('/audit/export?' + qs);
          const data = await resp.json();
          const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href=url; a.download='audit.csv'; a.click(); URL.revokeObjectURL(url);
        });
        document.getElementById('anchor').addEventListener('click', async function(){
          await fetch('/audit/anchor', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: '{}' });
          alert('Anchoring requested');
        });
        (async function(){ renderRows(await fetchLogs({})); })();
      `}} />
    </main>
  );
}


