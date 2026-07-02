export function toast(title, body = "", kind = "") {
  const host = document.getElementById("toastStack");
  if (!host) return;
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.innerHTML = `<strong></strong><span></span>`;
  node.querySelector("strong").textContent = title;
  node.querySelector("span").textContent = body;
  host.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}
