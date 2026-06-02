import type { InstantForm } from "../../../platform/flow";
import { alFlow } from "./al/flow";
import { akFlow } from "./ak/flow";
import { azFlow } from "./az/flow";
import { arFlow } from "./ar/flow";
import { caFlow } from "./ca/flow";
import { coFlow } from "./co/flow";
import { ctFlow } from "./ct/flow";
import { deFlow } from "./de/flow";
import { dcFlow } from "./dc/flow";
import { flFlow } from "./fl/flow";
import { gaFlow } from "./ga/flow";
import { hiFlow } from "./hi/flow";
import { idFlow } from "./id/flow";
import { ilFlow } from "./il/flow";
import { inFlow } from "./in/flow";
import { iaFlow } from "./ia/flow";
import { ksFlow } from "./ks/flow";
import { kyFlow } from "./ky/flow";
import { laFlow } from "./la/flow";
import { meFlow } from "./me/flow";
import { mdFlow } from "./md/flow";
import { maFlow } from "./ma/flow";
import { miFlow } from "./mi/flow";
import { mnFlow } from "./mn/flow";
import { msFlow } from "./ms/flow";
import { moFlow } from "./mo/flow";
import { mtFlow } from "./mt/flow";
import { neFlow } from "./ne/flow";
import { nvFlow } from "./nv/flow";
import { nhFlow } from "./nh/flow";
import { njFlow } from "./nj/flow";
import { nmFlow } from "./nm/flow";
import { nyFlow } from "./ny/flow";
import { ncFlow } from "./nc/flow";
import { ndFlow } from "./nd/flow";
import { ohFlow } from "./oh/flow";
import { okFlow } from "./ok/flow";
import { orFlow } from "./or/flow";
import { paFlow } from "./pa/flow";
import { riFlow } from "./ri/flow";
import { scFlow } from "./sc/flow";
import { sdFlow } from "./sd/flow";
import { tnFlow } from "./tn/flow";
import { txFlow } from "./tx/flow";
import { utFlow } from "./ut/flow";
import { vtFlow } from "./vt/flow";
import { vaFlow } from "./va/flow";
import { waFlow } from "./wa/flow";
import { wvFlow } from "./wv/flow";
import { wiFlow } from "./wi/flow";
import { wyFlow } from "./wy/flow";

export const autoFlows = {
  al: alFlow,
  ak: akFlow,
  az: azFlow,
  ar: arFlow,
  ca: caFlow,
  co: coFlow,
  ct: ctFlow,
  de: deFlow,
  dc: dcFlow,
  fl: flFlow,
  ga: gaFlow,
  hi: hiFlow,
  id: idFlow,
  il: ilFlow,
  in: inFlow,
  ia: iaFlow,
  ks: ksFlow,
  ky: kyFlow,
  la: laFlow,
  me: meFlow,
  md: mdFlow,
  ma: maFlow,
  mi: miFlow,
  mn: mnFlow,
  ms: msFlow,
  mo: moFlow,
  mt: mtFlow,
  ne: neFlow,
  nv: nvFlow,
  nh: nhFlow,
  nj: njFlow,
  nm: nmFlow,
  ny: nyFlow,
  nc: ncFlow,
  nd: ndFlow,
  oh: ohFlow,
  ok: okFlow,
  or: orFlow,
  pa: paFlow,
  ri: riFlow,
  sc: scFlow,
  sd: sdFlow,
  tn: tnFlow,
  tx: txFlow,
  ut: utFlow,
  vt: vtFlow,
  va: vaFlow,
  wa: waFlow,
  wv: wvFlow,
  wi: wiFlow,
  wy: wyFlow,
} as const satisfies Record<string, InstantForm>;
