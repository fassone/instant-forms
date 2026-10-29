import type { LegalPageContent } from "../../platform/rendering/legal-page";
import { legalLinks } from "./links";

const sample = {
  locale: "es",
  brandName: "Seguros Aseguranza",
  sampleNotice: "Documento de muestra para pruebas de diseño. No constituye la política vigente.",
  contentsLabel: "Contenido",
  returnLabel: "Volver a mi cotización",
  legalLinks,
} as const;

export const samplePrivacyPolicy: LegalPageContent = {
  ...sample,
  title: "Política de privacidad",
  introduction: "Este documento utiliza contenido de ejemplo para comprobar la lectura de una política extensa en teléfonos y computadoras. No describe compromisos definitivos ni sustituye una revisión de las prácticas reales. La entidad responsable, los canales de contacto, las fechas y las condiciones aplicables están pendientes de confirmación. Puede consultar cualquier sección y regresar a su cotización mediante los enlaces de esta página.",
  sections: [
    {
      id: "alcance",
      title: "Alcance e identidad del responsable",
      body: `La versión definitiva de esta sección deberá identificar a la entidad que opera el servicio y explicar a qué sitios, formularios y comunicaciones se aplica el documento. El nombre comercial mostrado en pantalla no sustituye la identificación legal de esa entidad. Su razón social, dirección y medios de contacto permanecen pendientes de confirmación para esta muestra.

También deberá distinguir entre el servicio de solicitud de cotizaciones y los servicios que puedan prestar otras organizaciones. Una explicación clara permitirá al visitante reconocer quién recibe su solicitud, quién responde sus preguntas y dónde consultar información adicional cuando abandona este sitio para visitar una página de un proveedor diferente.`,
    },
    {
      id: "informacion-proporcionada",
      title: "Información que proporciona el visitante",
      body: `Un formulario de cotización puede solicitar respuestas sobre el producto de interés, el estado de residencia o la ubicación de una propiedad, además de información de contacto. Esta sección de ejemplo muestra cómo se agruparían esas categorías sin incluir datos de una persona real. La lista final deberá comprobarse contra los campos efectivamente utilizados en cada recorrido.

Entre las categorías que deberán verificarse se encuentran:

- Respuestas sobre el producto y las opciones solicitadas.
- Datos de contacto proporcionados para el seguimiento.
- Confirmaciones y autorizaciones realizadas durante el recorrido.

El documento aprobado deberá explicar qué información es necesaria para tramitar la solicitud y qué información, si la hubiera, es opcional. También convendrá describir la diferencia entre escribir una respuesta, confirmarla y enviar la solicitud completa, de manera que el visitante no confunda una pantalla de revisión con una confirmación de cobertura.`,
    },
    {
      id: "informacion-tecnica",
      title: "Información técnica de la visita",
      body: `Además de las respuestas, los sistemas que sirven un sitio pueden recibir información técnica necesaria para procesar una visita. Entre las categorías que deberán revisarse figuran la dirección de red, las características del navegador, la página solicitada y los registros de errores. Esta enumeración es orientativa y no confirma que todas esas categorías se utilicen de la misma forma.

La explicación final deberá separar la información que llega al servidor de la información enviada a proveedores de análisis. No debe presentarse un identificador opaco como una garantía absoluta de anonimato. El alcance real dependerá de los datos asociados, de los usos permitidos y de las configuraciones que se aprueben para el servicio.`,
    },
    {
      id: "finalidades",
      title: "Finalidades del tratamiento",
      body: `Esta sección reservará espacio para explicar, con lenguaje cotidiano, por qué se utiliza cada categoría de información. La versión aprobada podrá distinguir entre preparar una solicitud, facilitar su seguimiento, mantener el funcionamiento técnico y comprender dificultades de navegación. Cada finalidad deberá corresponder a una práctica verificada y no a una lista genérica copiada de otro servicio.

Cuando una actividad requiera una explicación o elección específica, el documento deberá indicar dónde se ofrece esa información. La presencia de esta página no sustituye los avisos que correspondan dentro del formulario. Tampoco deberá interpretarse la lectura de este ejemplo como autorización para contactar al visitante o compartir sus respuestas con terceros.`,
    },
    {
      id: "destinatarios",
      title: "Proveedores y destinatarios de información",
      body: `Una política completa deberá describir las categorías de organizaciones que intervienen en la prestación del servicio y el tipo de información que reciben. Por ejemplo, deberá diferenciarse entre infraestructura técnica, análisis de uso y destinatarios de solicitudes de cotización. Los nombres, funciones y condiciones concretas de esas organizaciones están pendientes de revisión en este documento de muestra.

No se afirma aquí que los datos se vendan, que nunca se compartan o que todos los destinatarios actúen bajo las mismas condiciones. Esas conclusiones exigen comprobar las relaciones reales. El texto definitivo deberá permitir que una persona entienda el recorrido de su información sin tener que conocer la arquitectura técnica del sitio.`,
    },
    {
      id: "cookies",
      title: "Cookies y continuidad de la cotización",
      body: `Las cookies y otros mecanismos de almacenamiento pueden cumplir funciones diferentes. Esta sección servirá para explicar las categorías utilizadas por el servicio, incluyendo continuidad del formulario, identificación técnica y atribución de visitas cuando corresponda. Los nombres, duraciones y controles deberán reflejar la configuración efectiva; esta muestra no establece plazos nuevos ni modifica las cookies del navegador.

También deberá explicarse qué sucede cuando el visitante elimina una cookie, utiliza otro dispositivo o abre una sesión diferente. Una respuesta ya confirmada puede tratarse de forma distinta de un texto todavía sin enviar. La documentación final deberá describir esos límites con precisión, sin prometer recuperación de información que el producto no puede garantizar.`,
    },
    {
      id: "analitica",
      title: "Análisis de navegación",
      body: `El análisis de navegación puede ayudar a identificar pantallas difíciles de completar y problemas técnicos. En una versión aprobada se explicarán los eventos utilizados, las categorías de propiedades asociadas y los proveedores que participan. Debe distinguirse entre estadísticas de uso, perfiles técnicos y cualquier otra función que realmente se habilite, evitando incluir capacidades que no estén activas.

Esta muestra no constituye una declaración de que todas las visitas sean anónimas ni de que se registre cada interacción. La explicación final deberá describir los límites de la medición y los datos excluidos. También deberá aclarar cómo se relacionan los identificadores de visitante y de sesión con la información conservada por el servicio.`,
    },
    {
      id: "atribucion",
      title: "Publicidad y origen de la visita",
      body: `Cuando una persona llega desde un anuncio o un enlace compartido, la dirección de entrada puede contener información sobre su origen. La política definitiva deberá explicar qué parámetros se conservan, para qué se utilizan y con qué destinatarios se comparten. La existencia de un identificador publicitario no deberá confundirse automáticamente con una descripción completa de la actividad del visitante.

También será necesario diferenciar la medición dentro de este sitio de las operaciones realizadas por otros sistemas después del envío de una solicitud. Los detalles de cualquier comunicación de conversiones deberán confirmarse antes de publicar el documento. Este contenido de ejemplo no activa etiquetas publicitarias ni cambia la atribución guardada durante una cotización.`,
    },
    {
      id: "conservacion",
      title: "Conservación y eliminación",
      body: `Esta sección deberá explicar los criterios utilizados para conservar cada categoría de información. No todas las respuestas, los registros técnicos y los identificadores necesitan necesariamente el mismo tratamiento. Los plazos concretos, las excepciones y los procedimientos de eliminación permanecen pendientes de confirmación; no se establece aquí un número de días ni una promesa de eliminación inmediata.

El texto aprobado deberá indicar cómo se relaciona la conservación con el propósito de la solicitud y con las necesidades operativas verificadas. También convendrá distinguir la información guardada en el navegador de la conservada en sistemas externos. Borrar datos locales no debe presentarse como equivalente a eliminar automáticamente toda información previamente enviada a otros destinatarios.`,
    },
    {
      id: "seguridad",
      title: "Seguridad y acceso",
      body: `Una descripción de seguridad debe ser comprensible sin revelar configuraciones sensibles. Esta sección podrá explicar las categorías de medidas que realmente se aplican y cómo se limita el acceso a la información. La versión definitiva deberá verificarse con las personas responsables de la operación, y no afirmar certificaciones, auditorías o garantías que no se hayan documentado.

Como orientación editorial, conviene evitar expresiones absolutas como seguridad total o riesgo inexistente. Los visitantes necesitan saber dónde comunicar una inquietud y qué información no deberían enviar por canales inadecuados. El procedimiento de comunicación y las responsabilidades internas están pendientes de confirmación y no se sustituyen por los enlaces de navegación incluidos en esta página.`,
    },
    {
      id: "solicitudes",
      title: "Consultas y solicitudes sobre información",
      body: `La versión final deberá explicar cómo puede una persona formular preguntas o presentar solicitudes relacionadas con sus datos. El canal, el proceso de verificación y las respuestas disponibles deberán describirse según las condiciones que se confirmen para el servicio. Este ejemplo no establece derechos específicos de una jurisdicción ni fija un plazo de respuesta sin revisión previa.

Las instrucciones deberán evitar que el visitante envíe información innecesaria para identificar su solicitud. También convendrá diferenciar una consulta de privacidad de una petición sobre el estado de una cotización. El contacto responsable aparecerá aquí una vez aprobado; por ahora no se incluye una dirección de correo ficticia ni un formulario que reciba datos.`,
    },
    {
      id: "actualizaciones-contacto",
      title: "Actualizaciones y contacto",
      body: `El documento aprobado deberá indicar su fecha de vigencia y explicar cómo se comunicarán los cambios relevantes. Esa fecha no debe confundirse con la fecha de una prueba de interfaz o una actualización técnica del sitio. En esta muestra, la fecha, la identidad del responsable y los datos de contacto continúan expresamente pendientes de confirmación.

Antes de sustituir este contenido, deberán revisarse sus referencias a formularios, proveedores, cookies y procedimientos. La prueba visual busca comprobar que los títulos, párrafos y enlaces siguen siendo legibles incluso al final de un documento extenso. Puede regresar a su cotización mediante el enlace inferior; hacerlo no expresa aceptación de esta muestra ni envía una solicitud nueva.`,
    },
  ],
};

export const sampleTerms: LegalPageContent = {
  ...sample,
  title: "Términos y condiciones",
  introduction: "Los siguientes apartados son texto de muestra para evaluar el diseño de una página larga. No constituyen un contrato, una oferta de seguro ni condiciones vigentes. La redacción final, la entidad responsable y cualquier disposición jurídica requieren confirmación antes de publicarse como documentos oficiales. La navegación por esta página no añade una aceptación al formulario ni modifica una solicitud existente.",
  sections: [
    {
      id: "servicio",
      title: "Descripción y alcance del servicio",
      body: `La versión definitiva deberá explicar qué servicio se presta a través del sitio y cuál es el papel de la entidad que lo opera. Debe distinguirse entre facilitar una solicitud, presentar información y participar en la contratación de un producto. Esas funciones no se dan por supuestas en este texto de muestra y deberán describirse de acuerdo con la operación real.

El visitante debería poder comprender qué ocurrirá después de completar el recorrido y qué actuaciones corresponden a otras organizaciones. También deberán identificarse las limitaciones relevantes del servicio sin prometer resultados. Esta sección no afirma que el operador sea una aseguradora, un agente o un intermediario con una condición determinada pendiente de verificar.`,
    },
    {
      id: "participacion",
      title: "Condiciones de participación",
      body: `Esta sección reservará espacio para explicar quién puede utilizar el servicio y bajo qué condiciones. Los requisitos relacionados con ubicación, capacidad para solicitar información o disponibilidad de productos deberán confirmarse antes de incorporarlos al documento final. No se fija aquí una edad, una autorización especial ni un criterio territorial que no haya sido aprobado.

Cuando un formulario solicite información sobre otra persona o sobre una propiedad, las instrucciones deberán aclarar qué responsabilidades asume quien lo completa. El lenguaje debe ser concreto y consistente con las preguntas de la interfaz. Una condición incluida en el documento no debe contradecir las opciones que el propio recorrido permite seleccionar o enviar.`,
    },
    {
      id: "informacion-correcta",
      title: "Información proporcionada en el formulario",
      body: `El contenido definitivo deberá explicar la importancia de revisar la información antes de enviar una solicitud. Los datos de contacto y las respuestas sobre el producto pueden influir en las comunicaciones posteriores. Este apartado de ejemplo no establece consecuencias contractuales específicas; muestra el espacio necesario para describirlas con claridad una vez que se hayan confirmado.

La revisión del contenido deberá contemplar, entre otros puntos:

- Cómo corregir una respuesta antes de confirmarla.
- Qué significa la pantalla de revisión de datos.
- Dónde solicitar orientación después del envío.

También deberán explicarse los mecanismos disponibles para corregir una respuesta y los límites de la recuperación del progreso. Escribir en un campo no equivale siempre a guardar una respuesta. Al salir hacia otra página, un dato pendiente puede no conservarse. El documento y la interfaz deberán utilizar palabras coherentes para diferenciar revisión, confirmación, envío y seguimiento.`,
    },
    {
      id: "solicitud",
      title: "Solicitud de cotización y seguimiento",
      body: `La versión aprobada deberá describir el significado de enviar una solicitud y las etapas que pueden seguir. Deberá aclarar qué confirmaciones se muestran en el sitio y cuáles proceden de otros participantes. Este ejemplo no garantiza una respuesta dentro de un plazo determinado ni asegura que cada solicitud produzca una oferta de un proveedor.

Las instrucciones de seguimiento deberán indicar el canal apropiado y la información necesaria para localizar una solicitud, evitando pedir datos excesivos. También será importante distinguir una confirmación técnica de recepción de una evaluación del producto solicitado. Los mensajes finales del formulario y estas condiciones deberán revisarse juntos para que el visitante reciba una explicación consistente.`,
    },
    {
      id: "cotizaciones-cobertura",
      title: "Cotizaciones, precios y cobertura",
      body: `En una versión definitiva se explicará de dónde proceden las opciones de cotización y qué condiciones pueden afectar su disponibilidad. Los importes, coberturas y requisitos no deben presentarse como definitivos si necesitan confirmación posterior. La redacción tendrá que reflejar el funcionamiento real de los proveedores y los documentos que correspondan a cada producto ofrecido.

Esta muestra no garantiza el precio más bajo, la aceptación de una solicitud ni una cobertura específica. Tampoco describe el momento en que una póliza comenzaría a producir efectos. Esos puntos requieren información comprobada. El objetivo de este apartado es mostrar cómo leería una explicación extensa con párrafos claros y separación suficiente entre conceptos.`,
    },
    {
      id: "terceros",
      title: "Participación de terceros",
      body: `El servicio puede relacionarse con herramientas técnicas o con organizaciones que atiendan solicitudes. La versión final deberá identificar las funciones relevantes y explicar cuándo el visitante está tratando con una entidad diferente. No todas las relaciones tienen el mismo alcance, por lo que conviene evitar una única cláusula que presente a todos los participantes como equivalentes.

Cuando existan enlaces externos, deberá aclararse qué información adicional debe consultar el visitante en el sitio de destino. Las condiciones de ese tercero no se incorporan automáticamente a esta muestra. Cualquier referencia a responsabilidades, independencia o acuerdos entre entidades deberá verificarse antes de su publicación y redactarse sin atribuir facultades que no hayan sido confirmadas.`,
    },
    {
      id: "comunicaciones",
      title: "Comunicaciones y autorizaciones",
      body: `Esta sección deberá explicar cómo se relacionan las comunicaciones sobre una solicitud con los avisos y controles presentados en el formulario. El consentimiento específico para contactar a una persona debe tratarse de manera coherente con la interfaz correspondiente. La visita a una página de términos no sustituye por sí sola una selección o autorización que el producto solicite expresamente.

Los canales utilizados, las entidades que pueden contactar y los procedimientos para comunicar preferencias deberán confirmarse antes de redactar la versión definitiva. Esta muestra no modifica el texto del consentimiento ni agrega una casilla de aceptación. Tampoco autoriza llamadas o mensajes por el simple hecho de seguir un enlace o regresar a la cotización.`,
    },
    {
      id: "uso-permitido",
      title: "Uso del sitio y funcionamiento técnico",
      body: `El documento final podrá describir las conductas esperadas al utilizar el servicio y las restricciones necesarias para proteger su funcionamiento. Las reglas deberán ser comprensibles y proporcionales al producto real. Esta muestra no crea procedimientos de suspensión ni concede facultades de acceso a dispositivos o cuentas del visitante; esos aspectos requerirían una evaluación específica.

También convendrá explicar cómo informar de errores, enlaces rotos o dificultades al completar el recorrido. Los fallos de conexión y las interrupciones de terceros pueden afectar una experiencia web, pero cualquier descripción de sus consecuencias deberá revisarse. El texto de ejemplo permite evaluar listas, párrafos y títulos sin convertir esas observaciones en garantías de disponibilidad.`,
    },
    {
      id: "contenidos",
      title: "Contenido, marcas y materiales",
      body: `La versión aprobada deberá identificar el tratamiento de los contenidos del sitio, sus marcas y otros materiales. Si se utilizan recursos de terceros, las referencias deberán reflejar las autorizaciones y condiciones correspondientes. Este ejemplo no atribuye la titularidad de todos los elementos a una misma entidad ni establece licencias que todavía no hayan sido confirmadas.

Una explicación útil separará el uso ordinario del sitio de la reproducción o redistribución de sus materiales. También podrá indicar cómo comunicar una preocupación sobre contenido publicado, siempre que exista un canal verificado. No se incluye aquí un mecanismo ficticio de reclamación ni una dirección de contacto que pueda confundirse con un servicio operativo.`,
    },
    {
      id: "limites",
      title: "Limitaciones y aclaraciones del servicio",
      body: `Esta sección está reservada para las aclaraciones que resulten pertinentes después de revisar el servicio y sus condiciones aplicables. Cualquier limitación de responsabilidad deberá analizarse antes de publicarse y no debe generarse automáticamente a partir de un ejemplo visual. Por esa razón, este documento no introduce renuncias de derechos, acuerdos de arbitraje ni exclusiones generales.

La versión final deberá evitar contradicciones entre los compromisos comerciales y las explicaciones de sus límites. Los visitantes deben poder identificar qué información es orientativa y qué documentos describen una oferta concreta. El presente apartado solo proporciona una extensión de lectura representativa y deja pendientes las decisiones que requieren información contractual o jurídica adicional.`,
    },
    {
      id: "cambios",
      title: "Cambios y versiones del documento",
      body: `El texto aprobado deberá indicar cómo se identifican sus versiones y cuándo comienzan a aplicarse. La fecha de vigencia no puede deducirse de la fecha de una compilación o de una prueba de pantalla. También deberá confirmarse el procedimiento utilizado para comunicar modificaciones relevantes y cómo podrán consultarse las condiciones que correspondan a una interacción anterior.

Esta muestra no establece que continuar navegando implique aceptar cambios futuros. Cualquier mecanismo de aceptación tendrá que decidirse de forma explícita y reflejarse tanto en los documentos como en el producto. Para evaluar el diseño se mantienen títulos, párrafos y enlaces, pero no se añade un flujo de firma, aceptación o almacenamiento de versiones.`,
    },
    {
      id: "contacto",
      title: "Contacto e información pendiente",
      body: `La sección final deberá incluir los datos verificados de la entidad responsable y los canales de consulta apropiados. También deberá distinguir, cuando corresponda, entre preguntas sobre una cotización, incidencias técnicas y cuestiones de privacidad. En este documento de muestra, la razón social, la dirección, los canales de contacto y la fecha de vigencia permanecen pendientes de confirmación.

Antes de publicar una versión oficial será necesario revisar cada apartado y retirar el aviso de muestra únicamente tras la aprobación correspondiente. Mientras tanto, los enlaces inferiores permiten comprobar la navegación entre documentos y el regreso al formulario. No se envían nuevas respuestas al utilizar estos enlaces y su presencia no convierte este texto de prueba en condiciones aceptadas.`,
    },
  ],
};
