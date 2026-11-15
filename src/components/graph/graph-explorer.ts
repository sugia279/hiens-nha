import { onPageMount, type PageScope } from '../../lib/page-lifecycle';
/**
 * Graph explorer browser controller.
 * Loaded only on /graph/. Lazy-loads Cytoscape.js, fetches the manifest,
 * renders a bounded selected-node ego graph, and syncs URL/history state.
 * Fails gracefully to the static semantic HTML fallback.
 *
 * Registry: Browser component, M10.
 * No build-time imports; browser-only execution.
 */

import cytoscape from 'cytoscape';
import type { Core, NodeDefinition, EdgeDefinition, ElementDefinition } from 'cytoscape';
import { clientCopy, clientUrl, escapeHtml, collectionLabel } from '../../lib/client-locale';

// ---------------------------------------------------------------------------
// Manifest types (mirrors GraphManifest from src/types/graph.ts)
// ---------------------------------------------------------------------------

interface ManifestNode {
  id: string;
  collection: string;
  entryId: string;
  title: string;
  description: string;
  url: string;
  domains: string[];
  tags: string[];
}

interface ManifestEdge {
  source: string;
  target: string;
  type: string;
  context?: string;
}

interface GraphManifest {
  schemaVersion: number;
  nodes: ManifestNode[];
  edges: ManifestEdge[];
}

// ---------------------------------------------------------------------------
// Query state
// ---------------------------------------------------------------------------

function getUrlParams(): { node?: string; domain?: string; collection?: string; type?: string } {
  const p = new URLSearchParams(window.location.search);
  return {
    node: p.get('node') ?? undefined,
    domain: p.get('domain') ?? undefined,
    collection: p.get('collection') ?? undefined,
    type: p.get('type') ?? undefined,
  };
}

function setUrlParam(key: string, value: string | undefined): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  window.history.pushState(window.history.state, '', url.toString());
}

// ---------------------------------------------------------------------------
// Ego graph computation (1-hop neighborhood of selected node)
// ---------------------------------------------------------------------------

function computeEgoGraph(
  manifest: GraphManifest,
  selectedId: string,
  domainFilter?: string,
  collectionFilter?: string,
  typeFilter?: string,
): { nodes: ManifestNode[]; edges: ManifestEdge[] } {
  const nodeMap = new Map(manifest.nodes.map((n) => [n.id, n]));
  const selectedNode = nodeMap.get(selectedId);
  if (!selectedNode) return { nodes: [], edges: [] };

  // Get directly connected edges
  const connectedEdges = manifest.edges.filter(
    (e) =>
      (e.source === selectedId || e.target === selectedId) &&
      (!typeFilter || e.type === typeFilter),
  );

  // Collect neighboring node IDs
  const neighborIds = new Set<string>();
  for (const e of connectedEdges) {
    neighborIds.add(e.source);
    neighborIds.add(e.target);
  }

  // Filter neighbors by domain/collection
  const neighborNodes = [...neighborIds]
    .map((id) => nodeMap.get(id))
    .filter((n): n is ManifestNode => {
      if (!n) return false;
      if (domainFilter && !n.domains.includes(domainFilter)) return false;
      if (collectionFilter && n.collection !== collectionFilter) return false;
      return true;
    });

  // Keep edges only between included nodes
  const includedIds = new Set(neighborNodes.map((n) => n.id));
  const includedEdges = connectedEdges.filter(
    (e) => includedIds.has(e.source) && includedIds.has(e.target),
  );

  return { nodes: neighborNodes, edges: includedEdges };
}

// ---------------------------------------------------------------------------
// Cytoscape rendering
// ---------------------------------------------------------------------------

function renderCytoscape(
  container: HTMLElement,
  nodes: ManifestNode[],
  edges: ManifestEdge[],
  selectedId: string,
  onSelect: (nodeId: string) => void,
): Core {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const elements: ElementDefinition[] = [
    ...nodes.map<NodeDefinition>((n) => ({
      data: { id: n.id, label: n.title, collection: n.collection, url: n.url },
      classes: [n.collection, n.id === selectedId ? 'selected' : ''].filter(Boolean).join(' '),
    })),
    ...edges.map<EdgeDefinition>((e) => ({
      data: { id: `${e.source}→${e.target}`, source: e.source, target: e.target, type: e.type },
    })),
  ];

  const cy = cytoscape({
    container,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#3b82f6',
          'label': 'data(label)',
          'color': '#1e293b',
          'font-size': '11px',
          'text-wrap': 'wrap',
          'text-max-width': '80px',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'width': 32,
          'height': 32,
        },
      },
      {
        selector: 'node.selected',
        style: {
          'background-color': '#f59e0b',
          'width': 42,
          'height': 42,
        },
      },
      {
        selector: 'node.articles',
        style: { 'background-color': '#3b82f6' },
      },
      {
        selector: 'node.notes',
        style: { 'background-color': '#10b981' },
      },
      {
        selector: 'node.projects',
        style: { 'background-color': '#8b5cf6' },
      },
      {
        selector: 'node.series',
        style: { 'background-color': '#f97316' },
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#cbd5e1',
          'target-arrow-color': '#94a3b8',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
        },
      },
    ],
    layout: {
      name: 'cose',
      animate: !prefersReducedMotion,
      padding: 30,
    },
  });

  cy.on('tap', 'node', (evt) => {
    const nodeId = evt.target.id() as string;
    onSelect(nodeId);
  });

  return cy;
}

// ---------------------------------------------------------------------------
// Node details panel update
// ---------------------------------------------------------------------------

function updateDetailsPanel(
  detailsEl: HTMLElement,
  node: ManifestNode,
  manifest: GraphManifest,
): void {
  const outgoing = manifest.edges.filter((e) => e.source === node.id);
  const incoming = manifest.edges.filter((e) => e.target === node.id && e.type !== 'related');
  const symmetric = manifest.edges.filter((e) => e.source === node.id && e.type === 'related');

  const nodeMap = new Map(manifest.nodes.map((n) => [n.id, n]));

  function connectionItem(_e: ManifestEdge, targetId: string): string {
    const target = nodeMap.get(targetId);
    if (!target) return '';
    return `<li><a href="${escapeHtml(clientUrl(target.url))}" class="graph-node-details__link">${escapeHtml(target.title)}</a>
      <span class="graph-node-details__collection"> · ${escapeHtml(collectionLabel(target.collection))}</span></li>`;
  }

  const connectionHtml = [
    ...(outgoing.length
      ? [`<h4 style="font-size:0.75rem;color:#64748b;margin:0.5rem 0 0.25rem">${clientCopy('Outgoing', 'Liên kết đi')}</h4>`,
         `<ul style="list-style:none;padding:0;margin:0">${outgoing.map((e) => connectionItem(e, e.target)).join('')}</ul>`]
      : []),
    ...(incoming.length
      ? [`<h4 style="font-size:0.75rem;color:#64748b;margin:0.5rem 0 0.25rem">${clientCopy('Incoming', 'Liên kết đến')}</h4>`,
         `<ul style="list-style:none;padding:0;margin:0">${incoming.map((e) => connectionItem(e, e.source)).join('')}</ul>`]
      : []),
    ...(symmetric.length
      ? [`<h4 style="font-size:0.75rem;color:#64748b;margin:0.5rem 0 0.25rem">${clientCopy('Related', 'Có liên quan')}</h4>`,
         `<ul style="list-style:none;padding:0;margin:0">${symmetric.map((e) => connectionItem(e, e.target)).join('')}</ul>`]
      : []),
  ].join('');

  detailsEl.innerHTML = `
    <div class="graph-node-details__content">
      <p class="graph-node-details__collection">${escapeHtml(collectionLabel(node.collection))}</p>
      <h2 class="graph-node-details__title">
        <a href="${escapeHtml(clientUrl(node.url))}" class="graph-node-details__link">${escapeHtml(node.title)}</a>
      </h2>
      <p class="graph-node-details__description">${escapeHtml(node.description)}</p>
      ${connectionHtml || `<p class="graph-node-details__empty">${clientCopy('No connections for this entry.', 'Mục này chưa có liên kết tri thức.')}</p>`}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main controller
// ---------------------------------------------------------------------------

async function initGraphExplorer(page: PageScope): Promise<void> {
  const explorerEl = document.getElementById('graph-explorer');
  const canvasEl = document.getElementById('graph-canvas');
  const detailsEl = document.getElementById('graph-node-details');
  const controlsForm = document.getElementById('graph-controls') as HTMLFormElement | null;

  if (!explorerEl || !canvasEl || !detailsEl) return;

  const manifestUrl = explorerEl.dataset['manifestUrl'];
  if (!manifestUrl) return;

  // Fetch and validate manifest
  let manifest: GraphManifest;
  try {
    const res = await fetch(manifestUrl, { signal: page.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as GraphManifest;
    if (typeof json.schemaVersion !== 'number') throw new Error('Invalid manifest schema');
    manifest = json;
  } catch (err) {
    console.error('Graph manifest unavailable:', err);
    return; // Static HTML fallback remains visible
  }

  if (page.signal.aborted) return;
  // Mark canvas as enhanced (hides "requires JS" text)
  canvasEl.classList.add('is-enhanced');

  let currentCy: Core | null = null;
  page.cleanup(() => currentCy?.destroy());
  const params = getUrlParams();

  const resolvedCanvas = canvasEl;
  const resolvedDetails = detailsEl;

  function renderSelection(nodeId: string | undefined): void {
    if (currentCy) { currentCy.destroy(); currentCy = null; }

    if (!nodeId || manifest.nodes.length === 0) return;

    const node = manifest.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const filters = getUrlParams();
    const { nodes, edges } = computeEgoGraph(
      manifest,
      nodeId,
      filters.domain,
      filters.collection,
      filters.type,
    );

    if (nodes.length > 0) {
      currentCy = renderCytoscape(resolvedCanvas, nodes, edges, nodeId, (clickedId) => {
        setUrlParam('node', clickedId);
        renderSelection(clickedId);
        const clickedNode = manifest.nodes.find((n) => n.id === clickedId);
        if (clickedNode) updateDetailsPanel(resolvedDetails, clickedNode, manifest);
      });
    }

    updateDetailsPanel(resolvedDetails, node, manifest);
  }

  // Initial render from URL
  renderSelection(params.node);

  // Filter form events
  if (controlsForm) {
    controlsForm.addEventListener('change', () => {
      const data = new FormData(controlsForm);
      setUrlParam('domain', (data.get('domain') as string) || undefined);
      setUrlParam('collection', (data.get('collection') as string) || undefined);
      setUrlParam('type', (data.get('connectionType') as string) || undefined);
      const currentNode = getUrlParams().node;
      renderSelection(currentNode);
    });

    controlsForm.addEventListener('reset', () => {
      setTimeout(() => {
        if (page.signal.aborted) return;
        setUrlParam('domain', undefined);
        setUrlParam('collection', undefined);
        setUrlParam('type', undefined);
        renderSelection(getUrlParams().node);
      }, 0);
    });
  }

  // Handle browser back/forward
  page.listen(window, 'popstate', () => {
    renderSelection(getUrlParams().node);
  });
}

onPageMount(page => { void initGraphExplorer(page); });
