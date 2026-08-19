/**
 * Catrobat (Pocket Code) code.xml  ->  Snap! BYOB project XML
 *
 * Covers the common brick set: motion, looks, sound, control, variables,
 * broadcasts and the usual formula operators / functions / sensors.
 * "Touching the screen" (Tapped / WhenTouchDown) maps to Snap!'s
 * "when I am clicked" (receiveInteraction · pressed with the mouse).
 */

export type ConversionLog = {
  warnings: string[];
  sprites: number;
  scripts: number;
  bricks: number;
  costumes: number;
  sounds: number;
  unsupported: Record<string, number>;
};


export type MediaItem = { dataUrl: string; width?: number; height?: number };

export type MediaBundle = {
  images: Record<string, MediaItem>;
  sounds: Record<string, MediaItem>;
};

export type ConversionResult = {
  xml: string;
  projectName: string;
  log: ConversionLog;
};


const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ utils */

function child(node: Element | null, name: string): Element | null {
  if (!node) return null;
  for (const c of Array.from(node.children)) if (c.tagName === name) return c;
  return null;
}
function children(node: Element | null, name: string): Element[] {
  if (!node) return [];
  return Array.from(node.children).filter((c) => c.tagName === name);
}
function text(node: Element | null): string {
  return node?.textContent?.trim() ?? "";
}

/**
 * Catrobat XML is serialized by XStream, so repeated nodes (variables, looks,
 * sounds, objects…) are stored as `reference="../../foo/bar[2]"` pointers.
 * Without resolving them every variable would come out as "variable".
 */
function resolveRef(el: Element | null, seen = new Set<Element>()): Element | null {
  if (!el || seen.has(el)) return el;
  const ref = el.getAttribute("reference");
  if (!ref) return el;
  seen.add(el);
  let cur: Element | null = el;
  for (const seg of ref.split("/")) {
    if (!cur) return null;
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      cur = cur.parentElement;
      continue;
    }
    const m = /^([\w:.-]+)(?:\[(\d+)\])?$/.exec(seg);
    if (!m) return null;
    const kids = children(cur, m[1]!);
    cur = kids[m[2] ? parseInt(m[2], 10) - 1 : 0] ?? null;
  }
  return cur ? resolveRef(cur, seen) : null;
}


/* --------------------------------------------------------------- formulas */

const BIN_OPS: Record<string, string> = {
  PLUS: "reportVariadicSum",
  MINUS: "reportDifference",
  MULT: "reportVariadicProduct",
  DIVIDE: "reportQuotient",
  POW: "reportPower",
  EQUAL: "reportVariadicEquals",
  NOT_EQUAL: "!=",
  SMALLER_THAN: "reportVariadicLessThan",
  GREATER_THAN: "reportVariadicGreaterThan",
  SMALLER_OR_EQUAL: "reportVariadicLessThanOrEquals",
  GREATER_OR_EQUAL: "reportVariadicGreaterThanOrEquals",
  LOGICAL_AND: "reportVariadicAnd",
  LOGICAL_OR: "reportVariadicOr",
};

const VARIADIC = new Set([
  "reportVariadicSum",
  "reportVariadicProduct",
  "reportVariadicEquals",
  "reportVariadicLessThan",
  "reportVariadicGreaterThan",
  "reportVariadicLessThanOrEquals",
  "reportVariadicGreaterThanOrEquals",
  "reportVariadicAnd",
  "reportVariadicOr",
]);

const MONADIC: Record<string, string> = {
  ABS: "abs",
  SQRT: "sqrt",
  SIN: "sin",
  COS: "cos",
  TAN: "tan",
  ARCSIN: "asin",
  ARCCOS: "acos",
  ARCTAN: "atan",
  LN: "ln",
  LOG: "log",
  EXP: "e^",
  ROUND: "",
  CEIL: "ceiling",
  FLOOR: "floor",
};

const SENSORS: Record<string, string> = {
  OBJECT_X: "xPosition",
  OBJECT_Y: "yPosition",
  OBJECT_ROTATION: "direction",
  OBJECT_SIZE: "getScale",
};


function num(v: string) {
  return v.replace(/^\+/, "");
}

function variadic(sel: string, parts: string[]) {
  return `<block s="${sel}"><list>${parts.join("")}</list></block>`;
}

function formulaToSnap(f: Element | null, warn: (m: string) => void): string {
  if (!f) return "<l></l>";
  const type = text(child(f, "type"));
  const value = text(child(f, "value"));
  const left = child(f, "leftChild");
  const right = child(f, "rightChild");

  switch (type) {
    case "NUMBER":
      return `<l>${esc(num(value))}</l>`;
    case "STRING":
      return `<l>${esc(value)}</l>`;
    case "USER_VARIABLE":
      return `<block var="${esc(value)}"/>`;
    case "USER_LIST":
      return `<block var="${esc(value)}"/>`;
    case "BRACKET":
      return formulaToSnap(left ?? right, warn);
    case "OPERATOR": {
      if (value === "LOGICAL_NOT")
        return `<block s="reportNot">${formulaToSnap(left ?? right, warn)}</block>`;
      if (value === "MINUS" && !left)
        return `<block s="reportDifference"><l>0</l>${formulaToSnap(right, warn)}</block>`;
      const sel = BIN_OPS[value];
      const a = formulaToSnap(left, warn);
      const b = formulaToSnap(right, warn);
      if (!sel) {
        warn(`Unknown operator "${value}"`);
        return "<l></l>";
      }
      if (value === "NOT_EQUAL")
        return `<block s="reportNot">${variadic("reportVariadicEquals", [a, b])}</block>`;
      if (VARIADIC.has(sel)) return variadic(sel, [a, b]);
      return `<block s="${sel}">${a}${b}</block>`;
    }
    case "FUNCTION": {
      const a = () => formulaToSnap(left, warn);
      const b = () => formulaToSnap(right, warn);
      switch (value) {
        case "RAND":
          return `<block s="reportRandom">${a()}${b()}</block>`;
        case "MOD":
          return `<block s="reportModulus">${a()}${b()}</block>`;
        case "ROUND":
          return `<block s="reportRound">${a()}</block>`;
        case "MIN":
          return `<block s="reportVariadicMin"><list>${a()}${b()}</list></block>`;
        case "MAX":
          return `<block s="reportVariadicMax"><list>${a()}${b()}</list></block>`;
        case "JOIN":
          return `<block s="reportJoinWords"><list>${a()}${b()}</list></block>`;
        case "LENGTH":
          return `<block s="reportStringSize">${a()}</block>`;
        case "LETTER":
          return `<block s="reportLetter">${a()}${b()}</block>`;
        case "TRUE":
          return `<block s="reportBoolean"><l><bool>true</bool></l></block>`;
        case "FALSE":
          return `<block s="reportBoolean"><l><bool>false</bool></l></block>`;
        case "PI":
          return `<l>3.141592653589793</l>`;
        default: {
          const m = MONADIC[value];
          if (m !== undefined)
            return `<block s="reportMonadic"><l><option>${m || "floor"}</option></l>${a()}</block>`;
          warn(`Unsupported function "${value}"`);
          return "<l></l>";
        }
      }
    }
    case "SENSOR": {
      switch (value) {
        case "OBJECT_X":
          return `<block s="xPosition"/>`;
        case "OBJECT_Y":
          return `<block s="yPosition"/>`;
        case "OBJECT_ROTATION":
          return `<block s="direction"/>`;
        case "OBJECT_SIZE":
          return `<block s="getScale"/>`;
        case "OBJECT_TRANSPARENCY":
          return `<block s="getEffect"><l><option>ghost</option></l></block>`;
        case "OBJECT_BRIGHTNESS":
          return `<block s="getEffect"><l><option>brightness</option></l></block>`;
        case "TIMER":
          return `<block s="getTimer"/>`;
        case "FINGER_X":
          return `<block s="reportMouseX"/>`;
        case "FINGER_Y":
          return `<block s="reportMouseY"/>`;
        case "FINGER_TOUCHED":
          return `<block s="reportMouseDown"/>`;
        // The mouse *is* the phone: moving it right/left/up/down tilts the
        // device right/left/up/down. Mouse x -240..240 -> -90..90 degrees,
        // mouse y -180..180 -> -90..90 degrees.
        case "X_INCLINATION":
          return `<block s="reportVariadicProduct"><list><block s="reportMouseX"/><l>0.375</l></list></block>`;
        case "Y_INCLINATION":
          return `<block s="reportVariadicProduct"><list><block s="reportMouseY"/><l>0.5</l></list></block>`;
        // Acceleration follows the same "mouse = phone" idea (m/s², ±10).
        case "X_ACCELERATION":
          return `<block s="reportVariadicProduct"><list><block s="reportMouseX"/><l>0.0417</l></list></block>`;
        case "Y_ACCELERATION":
          return `<block s="reportVariadicProduct"><list><block s="reportMouseY"/><l>0.0556</l></list></block>`;
        case "Z_ACCELERATION":
          return `<l>0</l>`;
        case "COMPASS_DIRECTION":
          return `<block s="reportAtan2"><block s="reportMouseX"/><block s="reportMouseY"/></block>`;
        case "SCREEN_WIDTH":
          return `<l>480</l>`;
        case "SCREEN_HEIGHT":
          return `<l>360</l>`;
        default:
          if (SENSORS[value]) return `<block s="${SENSORS[value]}"/>`;
          warn(`Unsupported sensor "${value}" (device sensor has no Snap! equivalent)`);
          return "<l>0</l>";
      }
    }
    case "COLLISION_FORMULA":
      return `<block s="reportTouchingObject"><l><option>mouse-pointer</option></l></block>`;
    default:
      if (value) return `<l>${esc(value)}</l>`;
      return "<l></l>";
  }
}

function formulaOf(brick: Element, category: string): Element | null {
  const list = child(brick, "formulaList");
  for (const f of children(list, "formula")) {
    if (f.getAttribute("category") === category) return f;
  }
  return null;
}

function arg(brick: Element, category: string, warn: (m: string) => void, fallback = "0") {
  const f = formulaOf(brick, category);
  if (!f) return `<l>${esc(fallback)}</l>`;
  return formulaToSnap(f, warn);
}

/* ----------------------------------------------------------------- bricks */

type Ctx = {
  warn: (m: string) => void;
  unsupported: Record<string, number>;
  count: () => void;
  globals: Set<string>;
};

function refName(el: Element | null): string {
  if (!el) return "";
  const n = child(el, "name");
  if (n) return text(n);
  const attr = el.getAttribute("name");
  return attr ?? text(el);
}

function bricksToSnap(brickList: Element | null, ctx: Ctx): string {
  const list = brickList ? children(brickList, "brick") : [];
  const out: string[] = [];
  let i = 0;

  while (i < list.length) {
    const b = list[i]!;
    const type = b.getAttribute("type") ?? b.tagName;
    ctx.count();

    // ---- nesting: if / else / end
    if (type === "IfLogicBeginBrick" || type === "IfThenLogicBeginBrick") {
      const cond = arg(b, "IF_CONDITION", ctx.warn);
      const thenBody: Element[] = [];
      const elseBody: Element[] = [];
      let depth = 0;
      let bucket = thenBody;
      let hasElse = false;
      i++;
      for (; i < list.length; i++) {
        const cur = list[i]!;
        const t = cur.getAttribute("type") ?? "";
        if (t === "IfLogicBeginBrick" || t === "IfThenLogicBeginBrick") depth++;
        if (t === "IfLogicElseBrick" && depth === 0) {
          hasElse = true;
          bucket = elseBody;
          continue;
        }
        if (t === "IfLogicEndBrick" || t === "IfThenLogicEndBrick") {
          if (depth === 0) break;
          depth--;
        }
        bucket.push(cur);
      }
      i++;
      const wrap = (els: Element[]) => {
        const holder = b.ownerDocument.createElement("brickList");
        els.forEach((e) => holder.appendChild(e.cloneNode(true)));
        return bricksToSnap(holder, ctx);
      };
      out.push(
        hasElse
          ? `<block s="doIfElse">${cond}<script>${wrap(thenBody)}</script><script>${wrap(elseBody)}</script></block>`
          : `<block s="doIf">${cond}<script>${wrap(thenBody)}</script></block>`,
      );
      continue;
    }
    if (type === "IfLogicElseBrick" || type === "IfLogicEndBrick" || type === "IfThenLogicEndBrick") {
      i++;
      continue;
    }

    if (type === "ForeverBrick" || type === "RepeatBrick" || type === "RepeatUntilBrick") {
      const body: Element[] = [];
      let depth = 0;
      i++;
      for (; i < list.length; i++) {
        const cur = list[i]!;
        const t = cur.getAttribute("type") ?? "";
        if (t === "ForeverBrick" || t === "RepeatBrick" || t === "RepeatUntilBrick") depth++;
        if (t === "LoopEndBrick" || t === "LoopEndlessBrick") {
          if (depth === 0) break;
          depth--;
        }
        body.push(cur);
      }
      i++;
      const holder = b.ownerDocument.createElement("brickList");
      body.forEach((e) => holder.appendChild(e.cloneNode(true)));
      const inner = bricksToSnap(holder, ctx);
      if (type === "ForeverBrick") out.push(`<block s="doForever"><script>${inner}</script></block>`);
      else if (type === "RepeatBrick")
        out.push(
          `<block s="doRepeat">${arg(b, "TIMES_TO_REPEAT", ctx.warn, "10")}<script>${inner}</script></block>`,
        );
      else
        out.push(
          `<block s="doUntil">${arg(b, "REPEAT_UNTIL_CONDITION", ctx.warn)}<script>${inner}</script></block>`,
        );
      continue;
    }
    if (type === "LoopEndBrick" || type === "LoopEndlessBrick") {
      i++;
      continue;
    }

    out.push(simpleBrick(b, type, ctx));
    i++;
  }
  return out.join("");
}

function simpleBrick(b: Element, type: string, ctx: Ctx): string {
  const a = (c: string, fb = "0") => arg(b, c, ctx.warn, fb);
  const userVar = () => refName(child(b, "userVariable"));

  switch (type) {
    /* motion */
    case "PlaceAtBrick":
      return `<block s="gotoXY">${a("X_POSITION")}${a("Y_POSITION")}</block>`;
    case "SetXBrick":
      return `<block s="setXPosition">${a("X_POSITION")}</block>`;
    case "SetYBrick":
      return `<block s="setYPosition">${a("Y_POSITION")}</block>`;
    case "ChangeXByNBrick":
      return `<block s="changeXPosition">${a("X_POSITION_CHANGE")}</block>`;
    case "ChangeYByNBrick":
      return `<block s="changeYPosition">${a("Y_POSITION_CHANGE")}</block>`;
    case "MoveNStepsBrick":
      return `<block s="forward">${a("STEPS")}</block>`;
    case "TurnLeftBrick":
      return `<block s="turnLeft">${a("TURN_LEFT_DEGREES", "15")}</block>`;
    case "TurnRightBrick":
      return `<block s="turn">${a("TURN_RIGHT_DEGREES", "15")}</block>`;
    case "PointInDirectionBrick":
      return `<block s="setHeading">${a("DEGREES", "90")}</block>`;
    case "PointToBrick":
      return `<block s="doFaceTowards"><l><option>mouse-pointer</option></l></block>`;
    case "GlideToBrick":
      return `<block s="doGlide">${a("DURATION_IN_SECONDS", "1")}${a("X_DESTINATION")}${a("Y_DESTINATION")}</block>`;
    case "IfOnEdgeBounceBrick":
      return `<block s="bounceOffEdge"/>`;

    /* looks */
    case "SetLookBrick":
    case "SetLookByIndexBrick":
      return `<block s="doSwitchToCostume"><l><option>${esc(refName(child(b, "look")) || "Turtle")}</option></l></block>`;
    case "NextLookBrick":
      return `<block s="doWearNextCostume"/>`;
    case "PreviousLookBrick":
      return `<block s="doWearNextCostume"/>`;
    case "ShowBrick":
      return `<block s="show"/>`;
    case "HideBrick":
      return `<block s="hide"/>`;
    case "SetSizeToBrick":
      return `<block s="setScale">${a("SIZE", "100")}</block>`;
    case "ChangeSizeByNBrick":
      return `<block s="changeScale">${a("SIZE_CHANGE", "10")}</block>`;
    case "SetTransparencyBrick":
    case "SetGhostEffectBrick":
      return `<block s="setEffect"><l><option>ghost</option></l>${a("TRANSPARENCY", "0")}</block>`;
    case "ChangeTransparencyByNBrick":
      return `<block s="changeEffect"><l><option>ghost</option></l>${a("TRANSPARENCY_CHANGE", "10")}</block>`;
    case "SetBrightnessBrick":
      return `<block s="setEffect"><l><option>brightness</option></l>${a("BRIGHTNESS", "100")}</block>`;
    case "ClearGraphicEffectBrick":
      return `<block s="clearEffects"/>`;
    case "ComeToFrontBrick":
      return `<block s="goToLayer"><l><option>front</option></l></block>`;
    case "GoNStepsBackBrick":
      return `<block s="goBack">${a("STEPS", "1")}</block>`;
    case "SayBubbleBrick":
      return `<block s="bubble">${a("STRING", "Hello!")}</block>`;
    case "ThinkBubbleBrick":
      return `<block s="doThink">${a("STRING", "Hmm...")}</block>`;
    case "SayForBubbleBrick":
      return `<block s="doSayFor">${a("STRING", "Hello!")}${a("DURATION_IN_SECONDS", "2")}</block>`;
    case "ThinkForBubbleBrick":
      return `<block s="doThinkFor">${a("STRING", "Hmm...")}${a("DURATION_IN_SECONDS", "2")}</block>`;

    /* pen */
    case "PenDownBrick":
      return `<block s="down"/>`;
    case "PenUpBrick":
      return `<block s="up"/>`;
    case "SetPenSizeBrick":
      return `<block s="setSize">${a("PEN_SIZE", "1")}</block>`;
    case "ClearBackgroundBrick":
      return `<block s="clear"/>`;
    case "StampBrick":
      return `<block s="doStamp"/>`;

    /* sound */
    case "PlaySoundBrick":
      return `<block s="playSound"><l><option>${esc(refName(child(b, "sound")) || "pop")}</option></l></block>`;
    case "PlaySoundAndWaitBrick":
      return `<block s="doPlaySoundUntilDone"><l><option>${esc(refName(child(b, "sound")) || "pop")}</option></l></block>`;
    case "StopAllSoundsBrick":
      return `<block s="doStopAllSounds"/>`;
    case "SetVolumeToBrick":
      return `<block s="setVolume">${a("VOLUME", "100")}</block>`;
    case "ChangeVolumeByNBrick":
      return `<block s="changeVolume">${a("VOLUME_CHANGE", "10")}</block>`;
    case "SpeakBrick":
      return `<block s="bubble">${a("SPEAK", "Hello")}</block>`;

    /* control */
    case "WaitBrick":
      return `<block s="doWait">${a("TIME_TO_WAIT_IN_SECONDS", "1")}</block>`;
    case "WaitUntilBrick":
      return `<block s="doWaitUntil">${a("IF_CONDITION")}</block>`;
    case "BroadcastBrick":
      return `<block s="doBroadcast"><l>${esc(text(child(b, "broadcastMessage")) || "message1")}</l></block>`;
    case "BroadcastWaitBrick":
      return `<block s="doBroadcastAndWait"><l>${esc(text(child(b, "broadcastMessage")) || "message1")}</l></block>`;
    case "StopScriptBrick":
      return `<block s="doStopThis"><l><option>this script</option></l></block>`;
    case "NoteBrick":
      return `<block s="doWait"><l>0</l><comment w="180" collapsed="false">${esc(text(child(b, "note")))}</comment></block>`;
    case "CloneBrick":
      return `<block s="createClone"><l><option>myself</option></l></block>`;
    case "DeleteThisCloneBrick":
      return `<block s="removeClone"/>`;

    /* variables & lists */
    case "SetVariableBrick":
      return `<block s="doSetVar"><l>${esc(userVar() || "variable")}</l>${a("VARIABLE", "0")}</block>`;
    case "ChangeVariableBrick":
      return `<block s="doChangeVar"><l>${esc(userVar() || "variable")}</l>${a("VARIABLE", "1")}</block>`;
    case "ShowTextBrick":
    case "ShowTextColorSizeAlignmentBrick":
      return `<block s="doShowVar"><l>${esc(userVar() || "variable")}</l></block>`;
    case "HideTextBrick":
      return `<block s="doHideVar"><l>${esc(userVar() || "variable")}</l></block>`;
    case "AddItemToUserListBrick":
      return `<block s="doAddToList">${a("LIST_ADD_ITEM", "thing")}<block var="${esc(refName(child(b, "userList")) || "list")}"/></block>`;
    case "DeleteItemOfUserListBrick":
      return `<block s="doDeleteFromList">${a("LIST_DELETE_ITEM", "1")}<block var="${esc(refName(child(b, "userList")) || "list")}"/></block>`;
    case "InsertItemIntoUserListBrick":
      return `<block s="doInsertInList">${a("INSERT_ITEM_INTO_USERLIST_VALUE", "thing")}${a("INSERT_ITEM_INTO_USERLIST_INDEX", "1")}<block var="${esc(refName(child(b, "userList")) || "list")}"/></block>`;
    case "ReplaceItemInUserListBrick":
      return `<block s="doReplaceInList">${a("REPLACE_ITEM_IN_USERLIST_INDEX", "1")}<block var="${esc(refName(child(b, "userList")) || "list")}"/>${a("REPLACE_ITEM_IN_USERLIST_VALUE", "thing")}</block>`;

    default: {
      ctx.unsupported[type] = (ctx.unsupported[type] ?? 0) + 1;
      return `<block s="doWait"><l>0</l><comment w="220" collapsed="false">Catrobat brick not supported: ${esc(type)}</comment></block>`;
    }
  }
}

/* ---------------------------------------------------------------- scripts */

function hatBlock(script: Element, ctx: Ctx): string {
  const type = script.getAttribute("type") ?? "";
  switch (type) {
    case "StartScript":
      return `<block s="receiveGo"/>`;
    case "WhenScript": {
      // action="Tapped" -> touching the screen == clicking with the mouse
      return `<block s="receiveInteraction"><l><option>clicked</option></l></block>`;
    }
    case "WhenTouchDownScript":
      return `<block s="receiveInteraction"><l><option>clicked</option></l></block>`;
    case "BroadcastScript":
      return `<block s="receiveMessage"><l>${esc(text(child(script, "receivedMessage")) || "message1")}</l></block>`;
    case "WhenConditionScript": {
      const f = child(child(script, "formulaMap") ?? script, "formula") ?? formulaOf(script, "IF_CONDITION");
      return `<block s="receiveCondition">${formulaToSnap(f, ctx.warn)}</block>`;
    }
    case "WhenBackgroundChangesScript":
      return `<block s="receiveGo"/>`;
    default:
      ctx.warn(`Script type "${type}" mapped to "when green flag clicked"`);
      return `<block s="receiveGo"/>`;
  }
}

/* --------------------------------------------------------------- assembly */

function findMedia(bank: Record<string, MediaItem>, fileName: string, name: string) {
  if (!fileName && !name) return null;
  const tries = [fileName, baseOf(fileName), name].filter(Boolean).map((s) => s.toLowerCase());
  for (const t of tries) if (bank[t]) return bank[t]!;
  // Catrobat prefixes files with a checksum, e.g. "A1B2..._look.png"
  const wanted = baseOf(fileName || name);
  for (const key of Object.keys(bank)) {
    const k = baseOf(key);
    if (k === wanted || k.endsWith(`_${wanted}`) || wanted.endsWith(`_${k}`)) return bank[key]!;
  }
  return null;
}

function snapSprite(opts: {
  name: string;
  idx: number;
  id: number;
  scripts: string;
  vars: string;
  costumes: string;
  sounds: string;
  costumeIndex: number;
  x: number;
  y: number;
}) {
  const { name, idx, id, scripts, vars, costumes, sounds, costumeIndex, x, y } = opts;
  return (
    `<sprite name="${esc(name)}" idx="${idx}" x="${x}" y="${y}" heading="90" scale="1" volume="100" pan="0" rotation="1" draggable="true" costume="${costumeIndex}" color="80,80,80,1" pen="tip" id="${id}">` +
    `<costumes><list struct="atomic" id="${id + 1000}">${costumes}</list></costumes>` +
    `<sounds><list struct="atomic" id="${id + 2000}">${sounds}</list></sounds>` +
    `<blocks></blocks><variables>${vars}</variables><scripts>${scripts}</scripts></sprite>`
  );
}


export function convertCatrobatXml(
  xmlText: string,
  media: MediaBundle = { images: {}, sounds: {} },
): ConversionResult {
  const warnings: string[] = [];
  const unsupported: Record<string, number> = {};
  let brickCount = 0;
  const ctx: Ctx = {
    warn: (m) => {
      if (!warnings.includes(m)) warnings.push(m);
    },
    unsupported,
    count: () => {
      brickCount++;
    },
    globals: new Set<string>(),
  };

  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("This file is not valid Catrobat XML.");
  const program = doc.documentElement;
  if (!program || program.tagName !== "program")
    throw new Error("No <program> root found — is this a code.xml from a Catrobat project?");

  const header = child(program, "header");
  const projectName = text(child(header, "programName")) || "Catrobat project";

  // global variables
  const globalVarsXml: string[] = [];
  const progVarList = program.querySelector("programVariableList");
  if (progVarList) {
    for (const v of Array.from(progVarList.children)) {
      const n = refName(v);
      if (n) globalVarsXml.push(`<variable name="${esc(n)}"><l>0</l></variable>`);
    }
  }
  const progListList = program.querySelector("programListOfLists");
  if (progListList) {
    for (const v of Array.from(progListList.children)) {
      const n = refName(v);
      if (n) globalVarsXml.push(`<variable name="${esc(n)}"><list struct="atomic"></list></variable>`);
    }
  }

  // objects
  const objects: Element[] = [];
  const scenes = child(program, "scenes");
  if (scenes) {
    for (const scene of children(scenes, "scene")) {
      objects.push(...children(child(scene, "objectList"), "object"));
    }
  } else {
    objects.push(...children(child(program, "objectList"), "object"));
  }

  let scriptCount = 0;
  let costumeCount = 0;
  let soundCount = 0;
  const spriteXml: string[] = [];
  let idx = 1;
  let id = 10;
  let mediaId = 5000;

  for (const obj of objects) {
    const name = obj.getAttribute("name") || refName(child(obj, "name")) || `Sprite${idx}`;
    const scriptEls = children(child(obj, "scriptList"), "script");
    const scriptsXml: string[] = [];
    let y = 40;
    for (const s of scriptEls) {
      const body = bricksToSnap(child(s, "brickList"), ctx);
      scriptsXml.push(`<script x="40" y="${y}">${hatBlock(s, ctx)}${body}</script>`);
      y += 220;
      scriptCount++;
    }

    // sprite-local variables
    const localVars: string[] = [];
    const uvl = child(obj, "userVariables") ?? obj.querySelector("userVariables");
    if (uvl) {
      for (const v of Array.from(uvl.children)) {
        const n = refName(v);
        if (n) localVars.push(`<variable name="${esc(n)}"><l>0</l></variable>`);
      }
    }

    // costumes (Catrobat "looks")
    const costumesXml: string[] = [];
    for (const look of children(child(obj, "lookList"), "look")) {
      const lookName = look.getAttribute("name") || refName(look) || `costume${costumesXml.length + 1}`;
      const fileName = look.getAttribute("fileName") || text(child(look, "fileName"));
      const item = findMedia(media.images, fileName, lookName);
      if (!item) {
        if (fileName || lookName) ctx.warn(`Image "${fileName || lookName}" was not found in the archive.`);
        continue;
      }
      const cx = (item.width ?? 0) / 2;
      const cy = (item.height ?? 0) / 2;
      costumesXml.push(
        `<costume name="${esc(lookName)}" center-x="${cx}" center-y="${cy}" image="${item.dataUrl}" id="${mediaId++}"/>`,
      );
      costumeCount++;
    }

    // sounds
    const soundsXml: string[] = [];
    for (const snd of children(child(obj, "soundList"), "sound")) {
      const sndName = snd.getAttribute("name") || refName(snd) || `sound${soundsXml.length + 1}`;
      const fileName = snd.getAttribute("fileName") || text(child(snd, "fileName"));
      const item = findMedia(media.sounds, fileName, sndName);
      if (!item) {
        if (fileName || sndName) ctx.warn(`Sound "${fileName || sndName}" was not found in the archive.`);
        continue;
      }
      soundsXml.push(`<sound name="${esc(sndName)}" sound="${item.dataUrl}" id="${mediaId++}"/>`);
      soundCount++;
    }

    spriteXml.push(
      snapSprite({
        name,
        idx,
        id,
        scripts: scriptsXml.join(""),
        vars: localVars.join(""),
        costumes: costumesXml.join(""),
        sounds: soundsXml.join(""),
        costumeIndex: costumesXml.length ? 1 : 0,
        x: 0,
        y: 0,
      }),
    );
    idx++;
    id += 10;
  }

  if (spriteXml.length === 0) ctx.warn("The project contained no objects.");
  if (
    Object.keys(media.images).length === 0 &&
    program.querySelector("lookList look")
  )
    ctx.warn("No images were packed — upload the whole .catrobat archive instead of only code.xml.");

  const xml =
    `<project name="${esc(projectName)}" app="Snap! 10, https://snap.berkeley.edu" version="2">` +
    `<notes>Converted from Catrobat / Pocket Code. Touch events were mapped to mouse clicks.</notes>` +
    `<scenes select="1"><scene name="${esc(projectName)}">` +
    `<notes></notes><hidden></hidden><headers></headers><code></code><blocks></blocks>` +
    `<stage name="Stage" width="480" height="360" costume="0" color="255,255,255,1" tempo="60" threadsafe="false" penlog="false" volume="100" pan="0" lines="round" ternary="false" hyperops="true" codify="false" inheritance="true" sublistIDs="false" scheduled="false" id="1">` +
    `<pentrails></pentrails>` +
    `<costumes><list struct="atomic" id="2"></list></costumes>` +
    `<sounds><list struct="atomic" id="3"></list></sounds>` +
    `<blocks></blocks><variables></variables><scripts></scripts>` +
    `<sprites select="1">${spriteXml.join("")}</sprites>` +
    `</stage>` +
    `<variables>${globalVarsXml.join("")}</variables>` +
    `</scene></scenes></project>`;

  return {
    xml,
    projectName,
    log: {
      warnings,
      sprites: spriteXml.length,
      scripts: scriptCount,
      bricks: brickCount,
      costumes: costumeCount,
      sounds: soundCount,
      unsupported,
    },
  };
}

/* ------------------------------------------------------------------ media */

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const SOUND_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "audio/mp4",
};

function extOf(path: string) {
  return (path.split(".").pop() ?? "").toLowerCase();
}
function baseOf(path: string) {
  return (path.split("/").pop() ?? path).toLowerCase();
}

async function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  if (typeof Image === "undefined") return { width: 0, height: 0 };
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

/** Reads a .catrobat / .zip archive: code.xml plus every image and sound file. */
export async function readCatrobatArchive(file: File): Promise<{ xml: string; media: MediaBundle }> {
  const media: MediaBundle = { images: {}, sounds: {} };
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xml")) return { xml: await file.text(), media };

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("code.xml") ?? zip.file(/(^|\/)code\.xml$/i)[0] ?? null;
  if (!entry) throw new Error("No code.xml found inside the archive.");
  const xml = await entry.async("string");

  const files = zip.file(/.*/).filter((f) => !f.dir);
  for (const f of files) {
    const ext = extOf(f.name);
    const imgType = IMAGE_TYPES[ext];
    const sndType = SOUND_TYPES[ext];
    if (!imgType && !sndType) continue;
    // Catrobat sometimes stores .mp4 video; only treat as sound when in sounds/
    if (!imgType && ext === "mp4" && !/sounds?\//i.test(f.name)) continue;
    const b64 = await f.async("base64");
    const dataUrl = `data:${imgType ?? sndType};base64,${b64}`;
    const key = baseOf(f.name);
    if (imgType) {
      const { width, height } = await measureImage(dataUrl);
      media.images[key] = { dataUrl, width, height };
      media.images[f.name.toLowerCase()] = media.images[key]!;
    } else {
      media.sounds[key] = { dataUrl };
      media.sounds[f.name.toLowerCase()] = media.sounds[key]!;
    }
  }
  return { xml, media };
}

/** Back-compat helper: only the code.xml text. */
export async function readCatrobatFile(file: File): Promise<string> {
  return (await readCatrobatArchive(file)).xml;
}

