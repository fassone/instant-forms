import type { LegalPageContent } from "../../platform/rendering/legal-page";
import { legalLinks } from "./links";

export const termsAndConditions: LegalPageContent = {
  locale: "es",
  brandName: "Seguros Aseguranza",
  title: "Términos y condiciones",
  notice: {
    kind: "important",
    text: "AVISO IMPORTANTE: ESTOS TÉRMINOS INCLUYEN ARBITRAJE INDIVIDUAL OBLIGATORIO, RENUNCIA A PROCEDIMIENTOS COLECTIVOS Y LIMITACIONES DE RESPONSABILIDAD. LEA ESPECIALMENTE LAS SECCIONES 10, 13 Y 14.",
  },
  introduction: "**Última actualización: 29 de octubre de 2026**",
  contentsLabel: "Contenido",
  returnLabel: "Volver a mi cotización",
  legalLinks,
  sections: [
    {
      id: "operador-y-acuerdo",
      title: "Operador y acuerdo",
      body: `Seguros Aseguranza es una marca propiedad de Liderna Inc y operada por esta. Liderna Inc es una sociedad constituida en Delaware, Estados Unidos (“Liderna”, “nosotros”). Estos términos regulan el acceso y uso de nuestros sitios, formularios y servicios de recepción y remisión de solicitudes de información sobre seguros, conjuntamente el “Servicio”. Al aceptar estos términos, usted celebra un acuerdo con Liderna. Si no está de acuerdo, no debe utilizar el Servicio. Ningún agente, aseguradora o tercero está autorizado para modificar estos términos en nombre de Liderna.`,
    },
    {
      id: "alcance-del-servicio",
      title: "Alcance del Servicio",
      body: `Liderna es una empresa de generación y remisión de contactos comerciales. No somos una aseguradora, agencia ni corredor de seguros. No emitimos pólizas, vinculamos cobertura, determinamos primas, tramitamos siniestros ni prestamos asesoramiento profesional individualizado sobre seguros. El Servicio permite presentar una solicitud para que agentes de seguros puedan contactar al solicitante. Completar un formulario no contrata un seguro, no activa cobertura y no obliga a Liderna ni a ningún tercero a proporcionar una cotización, un producto o una oferta.`,
    },
    {
      id: "remision-y-remuneracion",
      title: "Remisión de solicitudes y remuneración",
      body: `El uso de nuestros formularios es gratuito para el visitante. Liderna recibe remuneración por remitir o vender solicitudes a agentes de seguros con licencia, denominados los “Proveedores”. Podemos remitir una solicitud a uno o varios Proveedores; no ofrecemos exclusividad al solicitante ni garantizamos un número determinado de contactos. La selección de destinatarios puede considerar el producto solicitado, la ubicación y la disponibilidad de Proveedores. El Servicio no comprende necesariamente todas las opciones del mercado. La remisión de una solicitud no autoriza a los Proveedores a revenderla. El tratamiento de información personal se rige por la Política de privacidad y las autorizaciones aplicables.`,
    },
    {
      id: "resultados",
      title: "Ausencia de garantías sobre resultados",
      body: `No garantizamos aceptación, elegibilidad, disponibilidad, ahorro, una determinada prima, la tarifa más baja ni condiciones superiores a las ofrecidas por otros canales. Tampoco garantizamos que un Proveedor contacte al solicitante o lo haga dentro de un plazo específico. Toda oferta está sujeta a verificación, suscripción y condiciones del Proveedor y de la aseguradora correspondiente. Las referencias a rapidez, opciones o experiencias anteriores no constituyen promesas de resultados individuales. Cualquier cobertura deberá confirmarse mediante la documentación emitida por quien esté autorizado para otorgarla; nuestra confirmación de recepción de una solicitud no equivale a esa documentación.`,
    },
    {
      id: "requisitos-del-solicitante",
      title: "Requisitos e información del solicitante",
      body: `Debe tener capacidad legal para contratar y utilizar el Servicio únicamente para solicitudes legítimas. Declara que la información que proporciona es exacta, actualizada y que está autorizado para facilitarla. Debe ser titular o usuario autorizado del número de teléfono y demás medios de contacto indicados, con facultades para otorgar las autorizaciones correspondientes. Queda prohibido presentar datos de terceros sin autorización, solicitudes ficticias o información deliberadamente falsa. Podemos rechazar solicitudes incompletas, inconsistentes o sospechosas, sin obligación de verificarlas, corregirlas o garantizar su entrega.`,
    },
    {
      id: "comunicaciones",
      title: "Comunicaciones",
      body: `La presentación de una solicitud podrá dar lugar a contactos de uno o varios Proveedores por los canales facilitados y autorizados, incluidas llamadas, mensajes de texto y, cuando corresponda, correo electrónico u otros medios de mensajería. El alcance de las comunicaciones estará determinado por el consentimiento otorgado y la legislación aplicable. Los sistemas automatizados y las voces artificiales, pregrabadas o generadas mediante inteligencia artificial solo podrán utilizarse cuando exista la autorización legalmente exigida. Estos términos no sustituyen el consentimiento específico de marketing. La revocación podrá comunicarse mediante los mecanismos habilitados o cualquier otro medio razonable reconocido legalmente, incluido STOP cuando corresponda a mensajes de texto. Podrán aplicarse cargos de su operador de comunicaciones.`,
    },
    {
      id: "proveedores",
      title: "Proveedores y relaciones independientes",
      body: `Los Proveedores y aseguradoras son responsables de sus propias comunicaciones, recomendaciones, ofertas, licencias, contratos y decisiones. Su aparición o participación en el Servicio no constituye una garantía de Liderna sobre sus productos, solvencia, conducta o idoneidad para sus necesidades. Cualquier contratación se celebra directamente con el tercero correspondiente. Liderna no asume sus obligaciones contractuales ni responderá por incumplimientos que les sean exclusivamente atribuibles, salvo responsabilidad impuesta por una norma inderogable. Ningún Proveedor puede obligar a Liderna ni presentar sus propias promesas como compromisos nuestros.`,
    },
    {
      id: "uso-y-propiedad-intelectual",
      title: "Uso autorizado y propiedad intelectual",
      body: `Le concedemos una autorización limitada, revocable, no exclusiva e intransferible para utilizar el Servicio con fines personales y legítimos. No se concede ningún otro derecho sobre nuestras marcas, contenidos, diseños, software o bases de datos. Se prohíbe copiar o explotar comercialmente el Servicio sin autorización, realizar extracción automatizada no autorizada, intentar acceder a sistemas restringidos, introducir código malicioso, eludir controles, alterar registros, suplantar identidades o interferir con su funcionamiento. Podemos adoptar medidas técnicas y legales frente a estos usos, conservar evidencia pertinente y cooperar con las autoridades cuando corresponda.`,
    },
    {
      id: "disponibilidad-y-garantias",
      title: "Disponibilidad y exclusión de garantías",
      body: `EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, EL SERVICIO SE OFRECE EN SU ESTADO ACTUAL Y SEGÚN DISPONIBILIDAD. LIDERNA EXCLUYE LAS GARANTÍAS IMPLÍCITAS DE COMERCIABILIDAD, ADECUACIÓN A UN FIN PARTICULAR Y NO INFRACCIÓN, EN CUANTO SEAN LEGALMENTE RENUNCIABLES. No garantizamos funcionamiento continuo, compatibilidad con todos los dispositivos, ausencia de errores ni conservación permanente de formularios incompletos. Podemos modificar funcionalidades o suspender componentes por mantenimiento, seguridad o razones operativas. Ninguna información facilitada por un tercero amplía nuestras garantías ni crea obligaciones adicionales para Liderna.`,
    },
    {
      id: "limitacion-de-responsabilidad",
      title: "Limitación de responsabilidad",
      body: `EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, LIDERNA Y SUS DIRECTIVOS, EMPLEADOS Y REPRESENTANTES, POR ACTOS REALIZADOS EN EL EJERCICIO DE SUS FUNCIONES, NO RESPONDERÁN POR DAÑOS INDIRECTOS, INCIDENTALES, ESPECIALES, CONSECUENCIALES O PUNITIVOS, NI POR PÉRDIDA DE BENEFICIOS, OPORTUNIDADES, INGRESOS O DATOS, DERIVADOS DEL SERVICIO, AUN CUANDO SE HUBIERA ADVERTIDO SU POSIBILIDAD. LA RESPONSABILIDAD TOTAL AGREGADA DE LIDERNA POR TODAS LAS RECLAMACIONES RELACIONADAS CON EL SERVICIO NO EXCEDERÁ DE DOSCIENTOS DÓLARES ESTADOUNIDENSES (US$200). Estos límites se aplican cualquiera que sea el fundamento de la reclamación, incluida responsabilidad contractual o negligencia ordinaria. No limitan responsabilidad por fraude, dolo, negligencia grave ni derechos, indemnizaciones o remedios que la legislación aplicable prohíba limitar. Tampoco limitan los gastos arbitrales que Liderna deba asumir conforme a las reglas aplicables.`,
    },
    {
      id: "uso-indebido",
      title: "Responsabilidad por uso indebido",
      body: `En la medida permitida por la ley, deberá indemnizar a Liderna y a sus directivos y empleados por pérdidas y gastos razonables, incluidos honorarios legales, derivados de reclamaciones de terceros causadas por su fraude, suplantación, suministro deliberado de datos de contacto no autorizados o infracción intencional de derechos ajenos mediante el Servicio. Esta obligación se limita a las consecuencias atribuibles a su conducta y no cubre actos u omisiones de Liderna. No se aplica por presentar de buena fe una reclamación contra nosotros ni por ejercer derechos legales. Liderna le notificará la reclamación y no acordará, sin su consentimiento, una transacción que le imponga obligaciones no monetarias o una admisión de responsabilidad.`,
    },
    {
      id: "suspension-y-terminacion",
      title: "Restricción, suspensión y terminación",
      body: `Podemos rechazar solicitudes, limitar funcionalidades o suspender el acceso cuando resulte razonablemente necesario para prevenir fraude, proteger el Servicio, atender obligaciones legales o responder a incumplimientos de estos términos. Podremos actuar sin aviso previo cuando la seguridad, la urgencia o la ley lo justifiquen. La terminación del acceso no extingue obligaciones previamente contraídas ni las disposiciones que, por su naturaleza, deban subsistir, incluidas propiedad intelectual, limitación de responsabilidad y resolución de controversias. Estas facultades no autorizan la privación de derechos inderogables.`,
    },
    {
      id: "arbitraje",
      title: "Arbitraje obligatorio",
      body: `Usted y Liderna acuerdan resolver mediante arbitraje vinculante las controversias entre ambos relacionadas con el Servicio, la presentación o remisión de solicitudes, las comunicaciones vinculadas al Servicio, el tratamiento de información o estos términos, cualquiera que sea su fundamento jurídico, salvo las excepciones expresamente previstas. El acuerdo es recíproco, se rige por la Ley Federal de Arbitraje de Estados Unidos y no contempla una opción voluntaria de exclusión. Para las reclamaciones sujetas a arbitraje, ambas partes renuncian a un juicio ante juez o jurado.

El arbitraje será administrado por la American Arbitration Association (“AAA”) ante un árbitro neutral conforme a sus reglas de consumo y, cuando correspondan, sus reglas suplementarias de arbitrajes masivos. Las reglas y formularios están disponibles en [AAA](https://www.adr.org/industries/consumer/). Los gastos se distribuirán conforme a dichas reglas y a la ley. Las audiencias podrán realizarse a distancia; si fueran presenciales, tendrán lugar en una ubicación razonablemente accesible conforme a las reglas aplicables. El árbitro podrá conceder los remedios legalmente disponibles y emitirá un laudo motivado, susceptible de ejecución judicial y de la revisión limitada prevista por la ley. Las cuestiones sobre formación o existencia del acuerdo y exigibilidad de la renuncia colectiva corresponderán al tribunal competente; las restantes cuestiones de interpretación y alcance se delegan al árbitro, en la medida permitida.

Cualquiera de las partes podrá acudir a un tribunal de menor cuantía para reclamaciones que reúnan sus requisitos. Se mantienen las denuncias ante autoridades, las medidas provisionales permitidas y los procedimientos o remedios que legalmente no puedan someterse a arbitraje. Las solicitudes de medidas de interés público que deban permanecer disponibles en sede judicial podrán presentarse ante el tribunal competente. Si AAA declina administrar el caso, se aplicarán sus reglas y la ley, sin imponer unilateralmente otro administrador. Estas excepciones no constituyen una opción general de exclusión del arbitraje.`,
    },
    {
      id: "renuncia-colectiva",
      title: "Renuncia colectiva y separabilidad",
      body: `EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY, USTED Y LIDERNA ACUERDAN QUE LAS RECLAMACIONES COMPRENDIDAS EN EL ACUERDO DE ARBITRAJE SE RESOLVERÁN INDIVIDUALMENTE Y NO COMO ACCIONES COLECTIVAS O REPRESENTATIVAS. Ningún árbitro podrá tramitar arbitraje colectivo sin un acuerdo posterior, expreso y escrito de las partes. La administración coordinada de reclamaciones individuales conforme a las reglas de AAA no constituye por sí misma arbitraje colectivo. Si esta renuncia no pudiera aplicarse a una reclamación o remedio, esa parte se tramitará ante el foro competente y las restantes seguirán sujetas a arbitraje cuando puedan separarse. La invalidez parcial no extenderá las facultades del árbitro para tramitar procedimientos colectivos ni invalidará automáticamente el resto del acuerdo.`,
    },
    {
      id: "legislacion-y-jurisdiccion",
      title: "Legislación y jurisdicción",
      body: `Estos términos se regirán por las leyes de Delaware, sin desplazar la Ley Federal de Arbitraje ni las protecciones imperativas que correspondan al consumidor. Salvo las excepciones de menor cuantía y las reglas obligatorias de jurisdicción, las controversias no sujetas a arbitraje se someterán a los tribunales estatales o federales competentes situados en Delaware. Esta disposición no impone una sede presencial de arbitraje distinta de la prevista en la sección 13 ni excluye un foro que deba permanecer disponible por mandato legal.`,
    },
    {
      id: "modificaciones-y-contacto",
      title: "Modificaciones, disposiciones generales y contacto",
      body: `Podemos modificar estos términos y publicaremos la versión actualizada con su fecha de vigencia, proporcionando el aviso y obteniendo la aceptación que legalmente correspondan. No se modificarán retroactivamente controversias existentes mediante la sola publicación de una nueva versión. La falta de ejercicio de un derecho no implica su renuncia. Una disposición inválida se separará o limitará únicamente en la medida necesaria, manteniéndose las restantes cuando sea jurídicamente posible. Estos términos no sustituyen los consentimientos específicos ni convierten la Política de privacidad en una autorización general de marketing. Las consultas y notificaciones contractuales podrán dirigirse a **Liderna Inc, Atención: Asuntos legales, 1058 Windy Creek Path, Conroe, Texas 77304, Estados Unidos**. Esta dirección no sustituye los requisitos legales de notificación de procedimientos.`,
    },
  ],
};
