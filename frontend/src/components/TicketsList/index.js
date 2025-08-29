import React, { useState, useEffect, useReducer, useContext } from "react";
import { 
  socketConnection, 
  onTicketUpdate, 
  onMessage, 
  joinStatusRoom, 
  leaveStatusRoom,
  getSocketStatus
} from "../../services/socket";

import { makeStyles } from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import Paper from "@material-ui/core/Paper";

import TicketListItem from "../TicketListItem";
import TicketsListSkeleton from "../TicketsListSkeleton";

import useTickets from "../../hooks/useTickets";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
  ticketsListWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },

  ticketsList: {
    flex: 1,
    overflowY: "scroll",
    ...theme.scrollbarStyles,
    borderTop: "2px solid rgba(0, 0, 0, 0.12)",
  },

  ticketsListHeader: {
    color: "rgb(67, 83, 105)",
    zIndex: 2,
    backgroundColor: "white",
    borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  ticketsCount: {
    fontWeight: "normal",
    color: "rgb(104, 121, 146)",
    marginLeft: "8px",
    fontSize: "14px",
  },

  noTicketsText: {
    textAlign: "center",
    color: "rgb(104, 121, 146)",
    fontSize: "14px",
    lineHeight: "1.4",
  },

  noTicketsTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0px",
  },

  noTicketsDiv: {
    display: "flex",
    height: "100px",
    margin: 40,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
}));

const reducer = (state, action) => {
  console.log(`[REDUCER] Acao: ${action.type}`, action.payload);
  
  if (action.type === "LOAD_TICKETS") {
    const newTickets = action.payload;

    newTickets.forEach(ticket => {
      const ticketIndex = state.findIndex(t => t.id === ticket.id);
      if (ticketIndex !== -1) {
        state[ticketIndex] = ticket;
        if (ticket.unreadMessages > 0) {
          state.unshift(state.splice(ticketIndex, 1)[0]);
        }
      } else {
        state.push(ticket);
      }
    });

    return [...state];
  }

  if (action.type === "RESET_UNREAD") {
    const ticketId = action.payload;

    const ticketIndex = state.findIndex(t => t.id === ticketId);
    if (ticketIndex !== -1) {
      state[ticketIndex].unreadMessages = 0;
    }

    return [...state];
  }

  if (action.type === "UPDATE_TICKET") {
    const ticket = action.payload;

    const ticketIndex = state.findIndex(t => t.id === ticket.id);
    if (ticketIndex !== -1) {
      console.log(`[REDUCER] Atualizando ticket existente ${ticket.id}`);
      state[ticketIndex] = ticket;
    } else {
      console.log(`[REDUCER] Adicionando novo ticket ${ticket.id}`);
      state.unshift(ticket);
    }

    return [...state];
  }

  if (action.type === "UPDATE_TICKET_UNREAD_MESSAGES") {
    const ticket = action.payload;

    const ticketIndex = state.findIndex(t => t.id === ticket.id);
    if (ticketIndex !== -1) {
      state[ticketIndex] = ticket;
      state.unshift(state.splice(ticketIndex, 1)[0]);
    } else {
      state.unshift(ticket);
    }

    return [...state];
  }

  if (action.type === "UPDATE_TICKET_CONTACT") {
    const contact = action.payload;
    const ticketIndex = state.findIndex(t => t.contactId === contact.id);
    if (ticketIndex !== -1) {
      state[ticketIndex].contact = contact;
    }
    return [...state];
  }

  if (action.type === "DELETE_TICKET") {
    const ticketId = action.payload;
    const ticketIndex = state.findIndex(t => t.id === ticketId);
    if (ticketIndex !== -1) {
      state.splice(ticketIndex, 1);
    }

    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

// Normalização de status consistente com backend
const normalizeStatus = (s) => {
  if (!s) return "pending";
  const v = String(s).toLowerCase();
  // Manter open e pending como status separados
  if (v === "open") return "open";
  if (v === "pending") return "pending";
  if (v === "aguardando") return "aguardando";
  if (v === "atendendo") return "atendendo";
  if (v === "fechado" || v === "closed") return "fechado";
  return "pending";
};

const TicketsList = (props) => {
  const { status, searchParam, showAll, selectedQueueIds, updateCount, style } = props;
  const classes = useStyles();
  const [pageNumber, setPageNumber] = useState(1);
  const [ticketsList, dispatch] = useReducer(reducer, []);
  const { user } = useContext(AuthContext);

  console.log(`[TicketsList-${status}] RENDER - tickets: ${ticketsList.length}`);

  // Gerencia entrada/saída das salas de status
  useEffect(() => {
    console.log(`[TicketsList-${status}] Gerenciando sala - status: ${status}`);
    if (status) {
      const normalizedStatus = normalizeStatus(status);
      console.log(`[TicketsList-${status}] Entrando na sala: ${normalizedStatus}`);
      joinStatusRoom(normalizedStatus);
      
      return () => {
        console.log(`[TicketsList-${status}] Saindo da sala: ${normalizedStatus}`);
        leaveStatusRoom(normalizedStatus);
      };
    }
  }, [status]);

  useEffect(() => {
    console.log(`[TicketsList-${status}] Reset por mudança de filtros`);
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [status, searchParam, dispatch, showAll, selectedQueueIds]);

  const { tickets, hasMore, loading } = useTickets({
    pageNumber,
    searchParam,
    status,
    showAll,
    queueIds: JSON.stringify(selectedQueueIds),
  });

  useEffect(() => {
    console.log(`[TicketsList-${status}] Carregando tickets via API - quantidade: ${tickets.length}`);
    if (!status && !searchParam) return;
    dispatch({
      type: "LOAD_TICKETS",
      payload: tickets,
    });
  }, [tickets, status, searchParam]);

  // Socket listeners - COM DEBUG COMPLETO
  useEffect(() => {
    console.log(`[TicketsList-${status}] INICIANDO useEffect do socket`);
    console.log(`[TicketsList-${status}] Registrando handlers com:`, {
      status,
      searchParam,
      showAll,
      user: user?.id,
      selectedQueueIds,
      socketStatus: socketConnection()?.connected
    });

    const socket = socketConnection();
    
    if (!socket) {
      console.error(`[TicketsList-${status}] ERRO: Socket nao disponivel`);
      return;
    }

    console.log(`[TicketsList-${status}] Socket OK, registrando handlers...`);

    const shouldUpdateTicket = ticket => {
      const result = !searchParam &&
        (!ticket.userId || ticket.userId === user?.id || showAll) &&
        (!ticket.queueId || selectedQueueIds.indexOf(ticket.queueId) > -1);
      
      console.log(`[TicketsList-${status}] shouldUpdateTicket para ticket ${ticket.id}:`, {
        result,
        searchParam,
        ticketUserId: ticket.userId,
        currentUserId: user?.id,
        showAll,
        ticketQueueId: ticket.queueId,
        selectedQueueIds
      });
      
      return result;
    };

    console.log(`[TicketsList-${status}] Registrando onTicketUpdate...`);
    const offTicket = onTicketUpdate(data => {
      console.log(`[TicketsList-${status}] HANDLER EXECUTADO!`, {
        action: data.action,
        ticketId: data.ticket?.id || data.ticketId,
        ticketStatus: data.ticket?.status,
        componentStatus: status,
        timestamp: new Date().toISOString()
      });

      if (data.action === "updateUnread") {
        console.log(`[TicketsList-${status}] Processando updateUnread`);
        dispatch({ type: "RESET_UNREAD", payload: data.ticketId });
        return;
      }

      if (data.action === "create") {
        console.log(`[TicketsList-${status}] Processando CREATE para ticket ${data.ticket.id}`);
        
        if (shouldUpdateTicket(data.ticket)) {
          console.log(`[TicketsList-${status}] Adicionando ticket ${data.ticket.id}`);
          dispatch({ type: "UPDATE_TICKET", payload: data.ticket });
        } else {
          console.log(`[TicketsList-${status}] Ticket ${data.ticket.id} nao passou na validacao shouldUpdateTicket`);
        }
        return;
      }

      if (data.action === "upsert") {
        const ticketStatus = normalizeStatus(data.ticket?.status);
        const currentStatus = normalizeStatus(status);
        
        console.log(`[TicketsList-${status}] Processando UPSERT - ticketStatus: ${ticketStatus}, currentStatus: ${currentStatus}`);
        
        if (ticketStatus === currentStatus && shouldUpdateTicket(data.ticket)) {
          console.log(`[TicketsList-${status}] Adicionando ticket ${data.ticket.id} via UPSERT`);
          dispatch({ type: "UPDATE_TICKET", payload: data.ticket });
        } else {
          console.log(`[TicketsList-${status}] UPSERT ignorado - ticketStatus: ${ticketStatus} !== currentStatus: ${currentStatus}`);
        }
        return;
      }

      if (data.action === "update") {
        console.log(`[TicketsList-${status}] Processando UPDATE para ticket ${data.ticket?.id}`);
        if (shouldUpdateTicket(data.ticket)) {
          console.log(`[TicketsList-${status}] Atualizando ticket ${data.ticket.id}`);
          dispatch({ type: "UPDATE_TICKET", payload: data.ticket });
        } else {
          console.log(`[TicketsList-${status}] UPDATE ignorado - nao passou na validacao`);
        }
        return;
      }

      if (data.action === "delete") {
        console.log(`[TicketsList-${status}] Processando DELETE`);
        dispatch({ type: "DELETE_TICKET", payload: data.ticketId || data.ticket?.id });
        return;
      }

      console.warn(`[TicketsList-${status}] Acao nao tratada: ${data.action}`);
    });

    // Verificar se o handler foi registrado
    setTimeout(() => {
      const socketStatus = getSocketStatus();
      console.log(`[TicketsList-${status}] Status do socket apos registro:`, socketStatus.handlers);
      console.log(`[TicketsList-${status}] Handlers de ticket registrados: ${socketStatus.handlers.tickets}`);
      
      if (socketStatus.handlers.tickets === 0) {
        console.error(`[TicketsList-${status}] ERRO: Nenhum handler registrado!`);
      }
    }, 100);

    // Handler para mensagens
    const offMsg = onMessage(data => {
      console.log(`[TicketsList-${status}] Mensagem recebida:`, data.action);
      if (data.action === "create" && shouldUpdateTicket(data.ticket)) {
        dispatch({ type: "UPDATE_TICKET_UNREAD_MESSAGES", payload: data.ticket });
      }
    });

    // Handler para contatos
    const contactHandler = data => {
      console.log(`[TicketsList-${status}] Contato atualizado:`, data?.action);
      if (data?.action === "update" && data?.contact) {
        dispatch({ type: "UPDATE_TICKET_CONTACT", payload: data.contact });
      }
    };
    socket.on("contact", contactHandler);

    return () => {
      console.log(`[TicketsList-${status}] LIMPANDO handlers...`);
      try { 
        offTicket && offTicket(); 
        console.log(`[TicketsList-${status}] Handler de ticket removido`);
      } catch (err) {
        console.error(`[TicketsList-${status}] Erro ao remover listener de ticket:`, err);
      }
      try { 
        offMsg && offMsg(); 
        console.log(`[TicketsList-${status}] Handler de mensagem removido`);
      } catch (err) {
        console.error(`[TicketsList-${status}] Erro ao remover listener de mensagem:`, err);
      }
      try { 
        socket.off("contact", contactHandler); 
        console.log(`[TicketsList-${status}] Handler de contato removido`);
      } catch (err) {
        console.error(`[TicketsList-${status}] Erro ao remover listener de contato:`, err);
      }
    };
  }, [status, searchParam, showAll, user, selectedQueueIds]);

  useEffect(() => {
    if (typeof updateCount === "function") {
      updateCount(ticketsList.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketsList]);

  const loadMore = () => {
    setPageNumber(prevState => prevState + 1);
  };

  const handleScroll = e => {
    if (!hasMore || loading) return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      e.currentTarget.scrollTop = scrollTop - 100;
      loadMore();
    }
  };

  return (
    <Paper className={classes.ticketsListWrapper} style={style}>
      <Paper
        square
        name="closed"
        elevation={0}
        className={classes.ticketsList}
        onScroll={handleScroll}
      >
        <List style={{ paddingTop: 0 }}>
          {ticketsList.length === 0 && !loading ? (
            <div className={classes.noTicketsDiv}>
              <span className={classes.noTicketsTitle}>
                {i18n.t("ticketsList.noTicketsTitle")}
              </span>
              <p className={classes.noTicketsText}>
                {i18n.t("ticketsList.noTicketsMessage")}
              </p>
            </div>
          ) : (
            <>
              {ticketsList.map(ticket => (
                <TicketListItem ticket={ticket} key={ticket.id} />
              ))}
            </>
          )}
          {loading && <TicketsListSkeleton />}
        </List>
      </Paper>
    </Paper>
  );
};

export default TicketsList;