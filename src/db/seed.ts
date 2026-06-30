import { nanoid } from "nanoid";
import { store } from "./index.js";
import { JsonStore } from "./json-store.js";
import type { Chatbox, ChatboxDomainPermission, DocumentoKB, KnowledgeDomain, SystemSettingKey } from "../types.js";

/** Carga datos de ejemplo para poder probar el panel sin Zendesk. */
export async function seed() {
  const ahora = new Date().toISOString();

  const kbActual = await store.listKb();
  const sembrarKb = kbActual.length === 0;
  const sembrarBellobath = !kbActual.some((d) => d.dominio === "BELLOBATH");

  // --- KB Doccia (solo si la KB está vacía) ---
  const kbDoccia: DocumentoKB[] = !sembrarKb ? [] : [
    {
      id: nanoid(),
      titulo: "Garantía estándar de platos de ducha",
      descripcion: "Condiciones de garantía de platos de ducha de resina Doccia Group.",
      tipo: "garantia",
      dominio: "DOCCIA_CLIENTES",
      categoria: "Garantías",
      subcategoria: "Garantía estándar",
      nivelAcceso: "clientes",
      usadoPor: ["chatbox_doccia_clientes", "zendesk_ai"],
      prioridad: "high",
      status: "activo",
      tags: ["garantía", "platos ducha", "resina"],
      fuente: "Manual interno Doccia Group",
      version: "1.0",
      texto:
        "Los platos de ducha de resina tienen una garantia de 10 años contra defectos de fabricacion. " +
        "La garantia cubre delaminacion, fisuras estructurales y defectos de color de origen. " +
        "No cubre danos por mala instalacion, productos de limpieza abrasivos ni golpes. " +
        "Para tramitar una garantia se necesita: numero de pedido, foto del defecto y fecha de compra.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
    {
      id: nanoid(),
      titulo: "Plazos de entrega y logística",
      descripcion: "Información sobre plazos de envío, seguimiento y gestión de incidencias de transporte.",
      tipo: "faq",
      dominio: "DOCCIA_CLIENTES",
      categoria: "Logística",
      subcategoria: "Pedido retrasado",
      nivelAcceso: "clientes",
      usadoPor: ["chatbox_doccia_clientes", "zendesk_ai"],
      prioridad: "high",
      status: "activo",
      tags: ["logística", "envío", "plazos", "transporte"],
      fuente: null,
      version: "1.0",
      texto:
        "El plazo de entrega estandar es de 5 a 7 dias laborables. " +
        "Los envios se realizan con agencia de transporte y se notifica el numero de seguimiento por email. " +
        "Para incidencias de transporte (rotura, retraso) se debe avisar en las primeras 24 horas tras la entrega.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
    {
      id: nanoid(),
      titulo: "Horario de atención al cliente",
      descripcion: "Horario de atención al cliente de Doccia Group.",
      tipo: "faq",
      dominio: "GLOBAL",
      categoria: "Sin clasificar",
      subcategoria: null,
      nivelAcceso: "clientes",
      usadoPor: ["chatbox_doccia_clientes", "zendesk_ai"],
      prioridad: "medium",
      status: "activo",
      tags: ["horario", "atención"],
      fuente: null,
      version: "1.0",
      texto:
        "El horario de atencion es de lunes a viernes de 9:00 a 18:00. " +
        "Fuera de ese horario se puede dejar la consulta y se respondera el siguiente dia laborable.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
    {
      id: nanoid(),
      titulo: "Gama de producto y precios orientativos",
      descripcion: "Catálogo de gamas de platos de ducha y precios orientativos para comerciales.",
      tipo: "catalogo",
      dominio: "DOCCIA_COMERCIAL",
      categoria: "Comercial",
      subcategoria: "Catálogo",
      nivelAcceso: "comercial",
      usadoPor: ["chatbox_doccia_comercial"],
      prioridad: "high",
      status: "activo",
      tags: ["catálogo", "precios", "gamas", "producto"],
      fuente: "Tarifa comercial 2026",
      version: "2026.1",
      texto:
        "Gama Slate (efecto pizarra): desde 199€. Gama Stone (efecto piedra): desde 169€. " +
        "Gama Smooth (liso): desde 149€. Todos disponibles a medida y en 8 colores estandar. " +
        "Plazo de fabricacion a medida: 10-15 dias. Precios orientativos sin IVA; el presupuesto final lo confirma el equipo comercial.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
    {
      id: nanoid(),
      titulo: "Condiciones comerciales para distribuidores",
      descripcion: "Condiciones de tarifa, portes y pedido mínimo para distribuidores Doccia.",
      tipo: "regla_negocio",
      dominio: "DOCCIA_COMERCIAL",
      categoria: "Comercial",
      subcategoria: "Distribuidor",
      nivelAcceso: "interno",
      usadoPor: ["chatbox_doccia_comercial"],
      prioridad: "high",
      status: "activo",
      tags: ["distribuidor", "condiciones", "tarifa"],
      fuente: "Manual comercial interno",
      version: "1.0",
      texto:
        "Los distribuidores tienen tarifa especial segun volumen anual. Pedido minimo para tarifa de distribuidor: 10 unidades. " +
        "Portes gratuitos a partir de 500€ de pedido. Las condiciones concretas las cierra siempre una persona del equipo comercial.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
  ];
  for (const doc of kbDoccia) await store.addKb(doc);

  // --- KB Bellobath ---
  const kbBellobath: DocumentoKB[] = !sembrarBellobath ? [] : [
    {
      id: nanoid(),
      titulo: "Garantía y devoluciones Bellobath",
      descripcion: "Política de garantía legal y devoluciones de Bellobath.",
      tipo: "garantia",
      dominio: "BELLOBATH",
      categoria: "Bellobath",
      subcategoria: "Postventa Bellobath",
      nivelAcceso: "bellobath",
      usadoPor: ["chatbox_bellobath"],
      prioridad: "critical",
      status: "activo",
      tags: ["garantía", "devoluciones", "bellobath"],
      fuente: "FAQ Bellobath",
      version: "1.0",
      texto:
        "Bellobath ofrece 2 años de garantia legal en todos sus productos. Las devoluciones sin defecto se aceptan en los 30 dias siguientes a la recepcion, " +
        "el producto debe estar sin usar y en su embalaje original. Los gastos de devolucion corren a cargo del cliente salvo que el producto llegue defectuoso. " +
        "Para tramitar una devolucion o garantia: accede a tu cuenta en bellobath.com > 'Mis pedidos' > 'Solicitar devolucion', " +
        "o escribe a devoluciones@bellobath.com con tu numero de pedido y fotos del estado del producto.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
    {
      id: nanoid(),
      titulo: "Envíos y plazos Bellobath",
      descripcion: "Información de envíos, plazos, costes y gestión de daños en transporte Bellobath.",
      tipo: "faq",
      dominio: "BELLOBATH",
      categoria: "Bellobath",
      subcategoria: "Logística Bellobath",
      nivelAcceso: "bellobath",
      usadoPor: ["chatbox_bellobath"],
      prioridad: "high",
      status: "activo",
      tags: ["envíos", "plazos", "transporte", "bellobath"],
      fuente: null,
      version: "1.0",
      texto:
        "Bellobath envia a toda la Peninsula Iberica. Plazo estandar: 3-5 dias laborables. " +
        "Envio gratuito en pedidos superiores a 99€. Para pedidos menores, el coste de envio se calcula en el checkout. " +
        "Los platos de ducha viajan en embalaje reforzado especial. Recibirás un email con el numero de seguimiento cuando el pedido salga de almacen. " +
        "Si el pedido llega danado, fotografialo ANTES de firmar el albaran y contacta con nosotros en las primeras 24h.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
    {
      id: nanoid(),
      titulo: "Catálogo y medidas Bellobath",
      descripcion: "Formatos, acabados y opciones de personalización disponibles en Bellobath.",
      tipo: "catalogo",
      dominio: "BELLOBATH",
      categoria: "Bellobath",
      subcategoria: "Producto Bellobath",
      nivelAcceso: "bellobath",
      usadoPor: ["chatbox_bellobath"],
      prioridad: "high",
      status: "activo",
      tags: ["catálogo", "medidas", "acabados", "bellobath"],
      fuente: "bellobath.com",
      version: "1.0",
      texto:
        "Bellobath dispone de platos de ducha en resina en los siguientes formatos estandar: 70x70, 80x80, 90x90, 70x100, 80x100, 80x120, 90x120, 70x120. " +
        "Acabados disponibles: liso blanco, antideslizante blanco, liso gris, liso negro. " +
        "Para medidas especiales o colores personalizados, usa el configurador en bellobath.com/personalizado.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
    {
      id: nanoid(),
      titulo: "Ayuda con el pedido online Bellobath",
      descripcion: "Guía para realizar pedidos en bellobath.com: métodos de pago, cupones y facturas.",
      tipo: "procedimiento",
      dominio: "BELLOBATH",
      categoria: "Bellobath",
      subcategoria: "Comercial Bellobath",
      nivelAcceso: "bellobath",
      usadoPor: ["chatbox_bellobath"],
      prioridad: "medium",
      status: "activo",
      tags: ["pedido online", "pago", "cupón", "factura", "bellobath"],
      fuente: null,
      version: "1.0",
      texto:
        "Puedes comprar en bellobath.com sin necesidad de cuenta, pero recomendamos registrarte para seguir tus pedidos. " +
        "Metodos de pago aceptados: tarjeta, Bizum, transferencia bancaria y PayPal. " +
        "Si tienes un codigo de descuento, introdúcelo en el campo 'Cupon' durante el checkout, antes de confirmar el pago. " +
        "Para facturas con datos de empresa, indica el CIF/NIF en la seccion de facturacion.",
      creadoEn: ahora,
      actualizadoEn: ahora,
    },
  ];
  for (const doc of kbBellobath) await store.addKb(doc);

  // ----------------------------------------------------------------
  // DOMINIOS, CHATBOXES, PERMISOS, SETTINGS
  // ----------------------------------------------------------------
  const domainsVacios = (store as JsonStore).domainsVacios ?? (await store.listDomains()).length === 0;

  if (domainsVacios) {
    const ahora2 = new Date().toISOString();

    const DOMINIOS: KnowledgeDomain[] = [
      { id: nanoid(), code: "GLOBAL", name: "Global", description: "Conocimiento común a todos los chatboxes: estilo, normativa, glosario, plantillas.", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "DOCCIA_CLIENTES", name: "Doccia Clientes", description: "Atención al cliente y resolución de tickets Zendesk de Doccia Group.", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "DOCCIA_COMERCIAL", name: "Doccia Comercial", description: "Apoyo al equipo comercial: tarifas, catálogos, argumentarios, distribuidores.", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "BELLOBATH", name: "Bellobath", description: "Marca online independiente. KB completamente aislada de Doccia.", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "SAP", name: "SAP", description: "Dominio reservado para integración futura con SAP (pedidos, facturas, stock).", isActive: false, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "HISTORICOS", name: "Históricos", description: "Histórico de tickets Zendesk importados para análisis y entrenamiento.", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "CASOS_APRENDIDOS", name: "Casos Aprendidos", description: "Repositorio de aprendizajes aprobados por humanos.", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
    ];
    for (const d of DOMINIOS) await store.upsertDomain(d);

    const domainByCode: Record<string, string> = {};
    for (const d of DOMINIOS) domainByCode[d.code] = d.id;

    const CHATBOXES: Chatbox[] = [
      { id: nanoid(), code: "doccia_clientes", name: "Doccia Clientes", description: "Bot de atención al cliente B2B de Doccia Group. Gestiona tickets Zendesk.", defaultModel: "gpt-4o-mini", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "doccia_comercial", name: "Doccia Comercial", description: "Bot de apoyo al equipo comercial. Accede a tarifas, catálogos y argumentarios.", defaultModel: "gpt-4o-mini", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
      { id: nanoid(), code: "bellobath", name: "Bellobath", description: "Bot de atención al cliente de Bellobath (marca online independiente).", defaultModel: "gpt-4o-mini", isActive: true, creadoEn: ahora2, actualizadoEn: ahora2 },
    ];
    for (const c of CHATBOXES) await store.upsertChatbox(c);

    const cbByCode: Record<string, string> = {};
    for (const c of CHATBOXES) cbByCode[c.code] = c.id;

    type PermDef = { chatbox: string; domain: string; read: boolean; write: boolean; train: boolean };
    const PERMS: PermDef[] = [
      { chatbox: "doccia_clientes", domain: "GLOBAL",           read: true,  write: false, train: false },
      { chatbox: "doccia_clientes", domain: "DOCCIA_CLIENTES",  read: true,  write: true,  train: true  },
      { chatbox: "doccia_clientes", domain: "HISTORICOS",       read: true,  write: false, train: true  },
      { chatbox: "doccia_clientes", domain: "CASOS_APRENDIDOS", read: true,  write: true,  train: true  },
      { chatbox: "doccia_comercial", domain: "GLOBAL",          read: true,  write: false, train: false },
      { chatbox: "doccia_comercial", domain: "DOCCIA_COMERCIAL",read: true,  write: true,  train: true  },
      { chatbox: "doccia_comercial", domain: "HISTORICOS",      read: true,  write: false, train: false },
      { chatbox: "bellobath", domain: "GLOBAL",                 read: true,  write: false, train: false },
      { chatbox: "bellobath", domain: "BELLOBATH",              read: true,  write: true,  train: true  },
      { chatbox: "bellobath", domain: "CASOS_APRENDIDOS",       read: true,  write: true,  train: true  },
    ];
    const perms: ChatboxDomainPermission[] = PERMS.map((p) => ({
      id: nanoid(),
      chatboxId: cbByCode[p.chatbox],
      domainId: domainByCode[p.domain],
      accessLevel: (p.read && p.write ? "full" : p.read ? "read_only" : "none") as "full" | "read_only" | "none",
      canRead: p.read,
      canWrite: p.write,
      canTrain: p.train,
      creadoEn: ahora2,
    }));
    for (const p of perms) await store.upsertPermission(p);

    const SETTINGS: Array<{ key: SystemSettingKey; value: string; desc: string }> = [
      { key: "zendesk_webhook_processing_enabled", value: "true", desc: "Procesa eventos webhook de Zendesk. Si OFF, los recibe pero los omite." },
      { key: "zendesk_import_enabled", value: "true", desc: "Permite importar tickets nuevos desde Zendesk." },
      { key: "zendesk_ai_processing_enabled", value: "true", desc: "Llama a OpenAI para clasificar y generar borradores. Si OFF, no consume tokens." },
      { key: "zendesk_historical_import_enabled", value: "true", desc: "Permite importar histórico de Zendesk." },
    ];
    for (const s of SETTINGS) {
      await store.setSetting(s.key, s.value, "system", s.desc);
    }
  }

  return [];
}
