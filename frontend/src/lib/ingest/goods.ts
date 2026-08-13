// ------------------------------------------------------------------
// Goods / supply procurement gate.
//
// JSAN delivers services and engineering — surveying, network build, GIS,
// resourcing, programme management. It does not trade goods: it does not sell,
// import or export hardware, cable, servers or components. A procurement feed
// is full of notices that are purely a purchase of product, and they were the
// single largest source of noise on the board ("Purchase of Cisco network
// equipment", "Supply of network switches", "Procurement of telecommunications
// cables"). Roughly a quarter of stored in-domain rows are this shape.
//
// Like the domain filter, this gate NEVER deletes anything. It is applied:
//   · at ingest — goods notices are not persisted, so the store stops growing;
//   · at read   — rows stored before the gate existed simply stop surfacing.
// Widening the definition brings hidden rows back into view.
//
// The strongest available signal is the notice's own procurement category. TED
// renders every title as "Country – <English CPV label> – <native title>", and
// the CPV label is chosen by the buyer: "Network equipment" and "Optical-fibre
// cables" are product categories, "Topographical services" and
// "Telecommunications services" are service categories. That is far more
// reliable than scanning free text, which is why it is consulted before any
// keyword heuristic.
// ------------------------------------------------------------------

const PRODUCT_NOUN = String.raw`equipment|devices?|hardware|cables?|wiring|switches|routers?|firewalls?|servers?|computers?|laptops?|workstations?|printers?|scanners?|instruments?|appliances?|apparatus|machinery|machines?|vehicles?|furniture|spare parts?|components?|consumables?|cartridges?|toner|batteries|accessories|materials|supplies|goods|merchandise|access ?points?|handsets?|meters?`;

const BUY_VERB = String.raw`supply|supplies|purchase|purchasing|procurement|acquisition|delivery|rental|leasing|hire`;

const PRODUCT_RE = new RegExp(String.raw`\b(?:${PRODUCT_NOUN})\b`, "i");

/** A buy verb near the start of the work's own description. */
const LEADS_WITH_BUY = new RegExp(String.raw`^[^–—]{0,55}?\b(?:${BUY_VERB})\b`, "i");

/** A buy verb applied to a product anywhere in the text. */
const BUY_PRODUCT = new RegExp(
  String.raw`\b(?:${BUY_VERB})\b[^.;]{0,60}?\b(?:${PRODUCT_NOUN})\b` +
    String.raw`|\b(?:${PRODUCT_NOUN})\b[^.;]{0,30}?\b(?:${BUY_VERB})\b`,
  "i",
);

/** Physical trade — explicitly out of scope. */
const TRADE = /\b(?:import|export)(?:s|ation)?\s+of\b|\bimport\s+and\s+export\b/i;

/** CPV labels that name a product category. */
const PRODUCT_CPV = /\b(?:equipment|cables?|servers?|instruments?|appliances|hardware|meters?|devices?|apparatus|machinery|machines|furniture|vehicles?|parts|accessories|supplies|products|materials)\b/i;

/** CPV labels that name a service category. */
const SERVICE_CPV = /\bservices?\b/i;

/**
 * Wording that means the contract is delivery work even though a product is
 * mentioned. Deliberately excludes "framework agreement", "support" and bare
 * "management": a framework agreement to buy Cisco kit is still buying Cisco
 * kit, and "management devices" is a product.
 */
const DELIVERY_WORK =
  /\b(?:services?|consultanc\w*|maintenance|repair|installation|cabling services|deployment|integration|survey(?:ing|s)?|mapping|topograph\w*|cadastr\w*|photogrammetr\w*|geodet\w*|staffing|resourcing|managed services?)\b/i;

/** TED title segments: ["Country", "<CPV label>", "<native title>"]. */
function segments(title: string): string[] {
  return title.split(/\s[–—-]\s/);
}

function cpvLabel(title: string): string {
  const parts = segments(title);
  return parts.length >= 3 ? parts[1].trim() : "";
}

/** The buyer's own description of the work — the tail after the CPV label. */
function workDescription(title: string): string {
  const parts = segments(title);
  return parts.length >= 3 ? parts.slice(2).join(" - ").trim() : title;
}

/**
 * True when the notice is a purchase of physical product rather than a
 * contract for services or engineering.
 *
 * Order matters, most reliable signal first:
 *   1. import/export of goods — never in scope;
 *   2. the work itself reads as "buy <product>" — goods, whatever it is filed under;
 *   3. explicit delivery-work wording — a service, keep it;
 *   4. the buyer's own CPV category — service keeps, product excludes;
 *   5. fallback keyword test for sources that carry no CPV label.
 */
export function isGoodsProcurement(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  if (!t) return false;

  if (TRADE.test(t)) return true;

  const work = workDescription(t);
  if (LEADS_WITH_BUY.test(work) && PRODUCT_RE.test(work)) return true;
  if (DELIVERY_WORK.test(work)) return false;

  const label = cpvLabel(t);
  if (label) {
    if (SERVICE_CPV.test(label)) return false;
    if (PRODUCT_CPV.test(label)) return true;
  }

  return BUY_PRODUCT.test(t);
}

/**
 * Short reason a notice was treated as goods, for the reclassify report and the
 * detail page. Returns null when the notice is not goods.
 */
export function goodsReason(title: string | null | undefined): string | null {
  const t = (title ?? "").trim();
  if (!isGoodsProcurement(t)) return null;
  if (TRADE.test(t)) return "import/export of goods";
  const work = workDescription(t);
  if (LEADS_WITH_BUY.test(work) && PRODUCT_RE.test(work)) return "the contract is a purchase of product";
  const label = cpvLabel(t);
  if (label && PRODUCT_CPV.test(label)) return `filed under the product category "${label}"`;
  return "supply of product";
}
