export async function aiRequest(token, path, body, signal) {
  const response = await fetch('/api/ai/' + path, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'AI 요청 실패');
  return result;
}
