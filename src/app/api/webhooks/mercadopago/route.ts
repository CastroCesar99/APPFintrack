
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { parseISO, isValid } from 'date-fns';

async function updateUserSubscription(userId: string, preapprovalId: string, status: string, nextPaymentDateStr?: string | null) {
    console.log(`[WEBHOOK_ACTION] Iniciando atualização de assinatura para user: ${userId}, preapprovalId: ${preapprovalId}`);

    if (!adminApp) {
        throw new Error("CRITICAL: Firebase Admin SDK não inicializado. Não é possível atualizar a assinatura.");
    }

    try {
        const db = getFirestore(adminApp);
        const userDocRef = db.collection('users').doc(userId);

        const docSnap = await userDocRef.get();
        if (docSnap.exists() && docSnap.data()?.lastWebhookId === preapprovalId) {
            console.log(`[WEBHOOK_IDEMPOTENCY] Evento com preapprovalId ${preapprovalId} já processado. Ignorando.`);
            return;
        }

        let subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
        
        if (nextPaymentDateStr) {
            const parsedDate = parseISO(nextPaymentDateStr.replace(' ', 'T'));
            if (isValid(parsedDate)) {
                subscriptionEndDate = parsedDate;
                console.log(`[WEBHOOK_DATE_PARSE] Data de próximo pagamento '${nextPaymentDateStr}' parseada para: ${subscriptionEndDate.toISOString()}`);
            } else {
                 console.warn(`[WEBHOOK_WARN] Não foi possível parsear a data '${nextPaymentDateStr}'. Usando data padrão (1 mês).`);
            }
        }
        
        const subscriptionData = {
            subscriptionStatus: 'active' as const,
            subscriptionId: preapprovalId,
            subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
            subscriptionProvider: 'MercadoPago',
            lastWebhookTimestamp: Timestamp.now(),
            lastKnownStatus: status,
            lastWebhookId: preapprovalId, // Para controle de idempotência
        };

        console.log(`[WEBHOOK_FIRESTORE] Tentando escrever no Firestore para user: ${userId} com dados:`, JSON.stringify(subscriptionData));
        await userDocRef.set({ ...subscriptionData }, { merge: true });
        console.log(`[WEBHOOK_SUCCESS] Firestore atualizado para user ${userId}. Assinatura está ativa.`);

    } catch (dbError) {
        console.error(`[WEBHOOK_FIRESTORE_ERROR] Falha ao escrever no Firestore para user ${userId}.`, dbError);
        throw dbError;
    }
}

export async function POST(request: NextRequest) {
  console.log("----- [WEBHOOK_START] Novo Webhook do Mercado Pago Recebido -----");
  
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("CRITICAL_SERVER_ERROR: MERCADOPAGO_ACCESS_TOKEN não está definido no ambiente.");
        throw new Error("Configuração de pagamento do servidor está ausente.");
    }
    
    if (!adminApp) {
        console.error("CRITICAL_SERVER_ERROR: Firebase Admin SDK não foi inicializado.");
        throw new Error("Configuração de banco de dados do servidor está ausente.");
    }

    const client = new MercadoPagoConfig({ accessToken });
    const preapprovalClient = new PreApproval(client);

    const body = await request.json();
    console.log("[WEBHOOK_INFO] Corpo do Webhook Recebido:", JSON.stringify(body, null, 2));

    const topic = body.topic || body.type;
    const dataId = body.data?.id;

    if (String(dataId) === "123456") {
      console.log("[WEBHOOK_INFO] Notificação de teste recebida e confirmada. Retornando 200 OK.");
      return NextResponse.json({ success: true, message: "Notificação de teste recebida." }, { status: 200 });
    }
    
    if (!topic || !dataId) {
      console.log("[WEBHOOK_IGNORE] Tópico/tipo do evento ou ID dos dados ausente. Ignorando.", { topic, dataId });
      return NextResponse.json({ success: true, message: "Evento ignorado, tipo ou data.id ausente." });
    }

    if (topic === 'preapproval' || topic === 'subscription_preapproval') {
        console.log(`[WEBHOOK_PROCESS] Lidando com evento 'preapproval' para ID: ${dataId}`);
        let subscriptionDetails;

        try {
            console.log(`[WEBHOOK_API_CALL] Buscando detalhes para o preapproval ID: ${dataId}...`);
            subscriptionDetails = await preapprovalClient.get({ id: dataId });
            console.log("[WEBHOOK_API_SUCCESS] Detalhes completos do Preapproval:", JSON.stringify(subscriptionDetails, null, 2));
        } catch (apiError: any) {
            console.error(`[WEBHOOK_API_ERROR] Falha ao buscar detalhes para o preapproval ID: ${dataId}.`, apiError.message);
            // Retorna 200 para o MP não tentar reenviar indefinidamente um webhook para um ID inválido.
            return NextResponse.json({ success: true, message: `Confirmado. Não foi possível buscar detalhes para o ID ${dataId}.` }, { status: 200 });
        }

        const userId = subscriptionDetails?.external_reference;
        const finalStatus = subscriptionDetails?.status;
        const preapprovalId = subscriptionDetails?.id;
        const nextPaymentDate = subscriptionDetails?.next_payment_date;

        if (!userId) {
            console.log(`[WEBHOOK_IGNORE] UserID (external_reference) ausente nos detalhes da assinatura para o preapproval ID ${preapprovalId}. Nenhuma ação tomada.`);
            return NextResponse.json({ success: true, message: "Evento ignorado, external_reference ausente." });
        }

        if (finalStatus === 'authorized') {
            console.log(`[WEBHOOK_DATA_POINTS] Status: ${finalStatus}, UserID da external_reference: ${userId}, PreapprovalID: ${preapprovalId}`);
            await updateUserSubscription(userId, preapprovalId, finalStatus, nextPaymentDate);
        } else {
            console.log(`[WEBHOOK_IGNORE] Status da assinatura é '${finalStatus}'. Nenhuma ação de ativação necessária.`);
        }
    } else {
        console.log(`[WEBHOOK_IGNORE] Tipo de evento não manipulado: '${topic}'. Nenhuma ação tomada.`);
    }

    console.log("----- [WEBHOOK_END] Processado com sucesso. -----");
    return NextResponse.json({ success: true, message: "Webhook processado." }, { status: 200 });

  } catch (error: any) {
    console.error("[WEBHOOK_FATAL_ERROR] Erro não tratado durante o processamento do webhook:", error);
    // Retorna 200 para confirmar recebimento mesmo em caso de erro interno, prevenindo retentativas infinitas do MP.
    return NextResponse.json({ success: false, message: "Erro interno do servidor, mas a requisição foi confirmada." }, { status: 200 });
  }
}
