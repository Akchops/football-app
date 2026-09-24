/**
 * Which Gemini model does which job.
 *
 * This used to be "the newest model with flash or lite in its name". That rule
 * has no idea what a preview is, so as soon as Google published a new preview it
 * became the model behind the whole app - with no code change, the next time a
 * day-old cache entry expired. Previews think by default, change behaviour
 * between versions and are the first to be shed under load, which is how the
 * Coach, clip reading and schedule import could all start failing, or slow to a
 * minute, while nothing here had changed.
 *
 * So this is an allow-list rather than a deny-list. Only stable text models can
 * be picked: gemini-<version>-flash, optionally -lite, optionally a numbered
 * build. Previews, image and audio models, live models and the -latest aliases
 * cannot match the pattern at all, so a new Google release cannot take over
 * again - while a new *stable* release still qualifies the day it appears.
 */

/** One entry from the Gemini models list, as much of it as matters here. */
export interface ListedModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

/**
 * What the model is for. `standard` is the Coach and clip analysis, where the
 * better answer is worth a few seconds. `fast` is schedule import: reading a
 * table off a picture is extraction, and the wait is what people feel.
 */
export type Purpose = 'standard' | 'fast';

export interface RankOptions {
  /**
   * Models to try before anything discovered, best first - one forced in
   * config, then the last one that actually answered.
   */
  preferred?: readonly string[];
  /** Models that failed recently. Moved to the back, never dropped. */
  coolingDown?: ReadonlySet<string>;
}

const STABLE = /^gemini-(\d+)(?:\.(\d+))?-flash(-lite)?(?:-\d{3})?$/;

/**
 * The setting that makes a model answer straight away instead of deliberating
 * first, which differs by generation - and getting it wrong is not harmless.
 *
 * Gemini 2.5 takes a thinking budget, and 0 switches thinking off. Gemini 3 and
 * later reject a budget of 0 outright with "Request contains an invalid
 * argument" (measured 24 Sep; the same error took schedule import down on 27
 * Aug) and take a thinking level instead, where 'minimal' is the lowest.
 * Anything older gets nothing, since it does not think to begin with.
 */
export function thinkingOff(id: string): Record<string, unknown> {
  const match = /^gemini-(\d+)(?:\.(\d+))?/.exec(id);
  const major = Number(match?.[1] ?? 0);
  const minor = Number(match?.[2] ?? 0);
  if (major >= 3) return { thinkingConfig: { thinkingLevel: 'minimal' } };
  if (major === 2 && minor >= 5) return { thinkingConfig: { thinkingBudget: 0 } };
  return {};
}

/**
 * For the Coach and clips: some thought, but not an open-ended amount. Left to
 * its default a Gemini 3 model thinks at length, and the wait is what makes the
 * Coach feel broken - on 24 Sep, 3.6-flash wrote a three-drill plan at 'low'
 * in 6.6s. Older models are left to their own default.
 */
export function thinkingLight(id: string): Record<string, unknown> {
  const major = Number(/^gemini-(\d+)/.exec(id)?.[1] ?? 0);
  return major >= 3 ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
}

/**
 * Never used, even as a last resort. Most cannot give a JSON text answer at all;
 * the -latest aliases can, but Google repoints them without notice, which is
 * exactly the kind of silent switch this file exists to stop.
 */
const NEVER = /image|tts|audio|live|latest|embedding|aqa|imagen|veo|learnlm|gemma|robotics|computer-use/i;

interface Candidate {
  id: string;
  version: number;
  lite: boolean;
  stable: boolean;
}

function idOf(model: ListedModel): string {
  return (model.name ?? '').replace(/^models\//, '');
}

/** "3.1" sorts above "3" above "2.5"; a model with no readable version sorts last. */
function versionOf(id: string): number {
  const match = /gemini-(\d+)(?:\.(\d+))?/.exec(id);
  return match ? Number(match[1]) * 100 + Number(match[2] ?? 0) : 0;
}

function candidates(models: ListedModel[]): Candidate[] {
  // The list says which calls each model serves. If Google ever stops sending
  // that field entirely, fall back to trusting the name rather than choosing
  // nothing at all.
  const methodsListed = models.some((m) => Array.isArray(m.supportedGenerationMethods));

  const found: Candidate[] = [];
  const seen = new Set<string>();
  for (const model of models) {
    const id = idOf(model);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (methodsListed && !(model.supportedGenerationMethods ?? []).includes('generateContent')) continue;

    const stable = STABLE.exec(id);
    if (stable) {
      found.push({ id, version: versionOf(id), lite: Boolean(stable[3]), stable: true });
      continue;
    }

    // Anything else only ever matters if no stable model exists at all - a
    // preview beats an app with no coach. It still has to be a flash text model.
    if (/^gemini-.*flash/i.test(id) && !NEVER.test(id)) {
      found.push({ id, version: versionOf(id), lite: /lite/i.test(id), stable: false });
    }
  }
  return found;
}

/**
 * Every usable model for a job, best first. The caller tries them in order, so
 * the order is the whole policy:
 *
 * 1. Preferred models: forced in config, or the last one that answered.
 * 2. Stable models before any preview, always.
 * 3. For `standard`, full flash before lite; for `fast`, lite before full flash.
 * 4. Newer versions first; the plain name before a numbered build of it.
 * 5. Anything that failed in the last few minutes goes to the back.
 */
export function rankModels(models: ListedModel[], purpose: Purpose, options: RankOptions = {}): string[] {
  const preferLite = purpose === 'fast';
  const ranked = candidates(models)
    .sort(
      (a, b) =>
        Number(b.stable) - Number(a.stable) ||
        Number(a.lite !== preferLite) - Number(b.lite !== preferLite) ||
        b.version - a.version ||
        a.id.length - b.id.length ||
        (a.id < b.id ? -1 : 1),
    )
    .map((c) => c.id);

  const preferred = [...new Set((options.preferred ?? []).map((id) => id.trim()).filter(Boolean))];
  const ordered = [...preferred, ...ranked.filter((id) => !preferred.includes(id))];

  const cooling = options.coolingDown;
  if (!cooling || cooling.size === 0) return ordered;
  return [...ordered.filter((id) => !cooling.has(id)), ...ordered.filter((id) => cooling.has(id))];
}
