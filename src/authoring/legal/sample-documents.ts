import type { LegalPageContent } from "../../platform/rendering/legal-page";
import { legalLinks } from "./links";

const sample = {
  locale: "es",
  brandName: "Seguros Aseguranza",
  notice: { kind: "sample", text: "Documento de muestra para pruebas de diseño. No constituye la política vigente." },
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
