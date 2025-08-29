import React, { useContext, useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import SearchIcon from "@material-ui/icons/Search";
import InputBase from "@material-ui/core/InputBase";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Badge from "@material-ui/core/Badge";
import MoveToInboxIcon from "@material-ui/icons/MoveToInbox";
import CheckBoxIcon from "@material-ui/icons/CheckBox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";
import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsList";
import TabPanel from "../TabPanel";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../Can";
import TicketsQueueSelect from "../TicketsQueueSelect";
import { Button } from "@material-ui/core";
import { onTicketUpdate, joinStatusRoom, leaveStatusRoom } from "../../services/socket";
import List from "@material-ui/core/List";
import TicketListItem from "../TicketListItem";
import api from "../../services/api";

// Normalização de status
const normalizeStatus = (s) => {
  if (!s) return "pending";
  const v = String(s).toLowerCase();
  if (v === "open") return "open";
  if (v === "pending") return "pending";
  if (v === "aguardando") return "aguardando";
  if (v === "atendendo") return "atendendo";
  if (v === "fechado" || v === "closed") return "fechado";
  return "pending";
};

const CombinedTicketsList = ({ tabOpen, showAll, selectedQueueIds, updateOpenCount, updatePendingCount }) => {
  const [openTickets, setOpenTickets] = useState([]);
  const [pendingTickets, setPendingTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const { user } = useContext(AuthContext);

  // Função para buscar tickets da API
  const fetchTickets = async () => {
    try {
      setLoading(true);
      
      // Buscar tickets open
      const openParams = {
        pageNumber: 1,
        status: "open",
        showAll,
        queueIds: JSON.stringify(selectedQueueIds),
      };
      
      const openResponse = await api.get("/tickets", { params: openParams });
      
      // Buscar tickets pending  
      const pendingParams = {
        pageNumber: 1,
        status: "pending", 
        showAll,
        queueIds: JSON.stringify(selectedQueueIds),
      };
      
      const pendingResponse = await api.get("/tickets", { params: pendingParams });
      
      setOpenTickets(openResponse.data.tickets || []);
      setPendingTickets(pendingResponse.data.tickets || []);
      setHasInitialLoad(true);
      
    } catch (error) {
      console.error("Erro ao buscar tickets:", error);
      setOpenTickets([]);
      setPendingTickets([]);
    } finally {
      setLoading(false);
    }
  };

  // Buscar tickets na inicialização e quando parâmetros mudam
  useEffect(() => {
    setHasInitialLoad(false);
    fetchTickets();
  }, [showAll, selectedQueueIds]);

  // Gerencia salas de socket
  useEffect(() => {
    joinStatusRoom("open");
    joinStatusRoom("pending");
    
    return () => {
      leaveStatusRoom("open");
      leaveStatusRoom("pending");
    };
  }, []);

  // Handler para atualizações via socket - CORRIGIDO
  useEffect(() => {
    const shouldUpdateTicket = ticket => {
      const userMatch = !ticket.userId || ticket.userId === user?.id || showAll;
      const queueMatch = !ticket.queueId || selectedQueueIds.length === 0 || selectedQueueIds.indexOf(ticket.queueId) > -1;
      return userMatch && queueMatch;
    };

    const offTicket = onTicketUpdate(data => {
      console.log("CombinedTicketsList - Socket update received:", {
        action: data.action,
        ticketId: data.ticket?.id,
        ticketStatus: data.ticket?.status
      });
      
      if (data.action === "delete") {
        console.log("Removendo ticket:", data.ticketId);
        setOpenTickets(prev => prev.filter(t => t.id !== data.ticketId));
        setPendingTickets(prev => prev.filter(t => t.id !== data.ticketId));
        return;
      }

      // CORREÇÃO: Processar tanto "upsert" quanto "update" e "create"
      if (data.action !== "upsert" && data.action !== "update" && data.action !== "create") return;
      
      if (!data.ticket) {
        console.warn("Evento sem ticket:", data);
        return;
      }
      
      const ticketStatus = normalizeStatus(data.ticket.status);
      console.log("Status normalizado:", ticketStatus, "Original:", data.ticket.status);
      
      // Sempre remove o ticket das duas listas primeiro
      setOpenTickets(prev => {
        const filtered = prev.filter(t => t.id !== data.ticket.id);
        console.log(`Open tickets: ${prev.length} -> ${filtered.length}`);
        return filtered;
      });
      setPendingTickets(prev => {
        const filtered = prev.filter(t => t.id !== data.ticket.id);
        console.log(`Pending tickets: ${prev.length} -> ${filtered.length}`);
        return filtered;
      });
      
      // Só adiciona se o ticket deve aparecer para este usuário
      if (!shouldUpdateTicket(data.ticket)) {
        console.log("Ticket filtrado por shouldUpdateTicket");
        return;
      }
      
      if (ticketStatus === "open") {
        console.log("Adicionando ticket à lista OPEN:", data.ticket.id);
        setOpenTickets(prev => [data.ticket, ...prev]);
      } else if (ticketStatus === "pending") {
        console.log("Adicionando ticket à lista PENDING:", data.ticket.id);
        setPendingTickets(prev => [data.ticket, ...prev]);
      } else {
        console.log("Ticket com status ignorado:", ticketStatus);
      }
    });

    return offTicket;
  }, [showAll, selectedQueueIds, user]);

  // Atualiza contadores
  useEffect(() => {
    updateOpenCount && updateOpenCount(openTickets.length);
  }, [openTickets.length, updateOpenCount]);

  useEffect(() => {
    updatePendingCount && updatePendingCount(pendingTickets.length);
  }, [pendingTickets.length, updatePendingCount]);

  return (
    <>
      <div style={{ display: tabOpen === "open" ? "block" : "none" }}>
        <List style={{ paddingTop: 0 }}>
          {(loading && !hasInitialLoad) ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              Carregando tickets em aberto...
            </div>
          ) : openTickets.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>
              Nenhum ticket em aberto
            </div>
          ) : (
            openTickets.map(ticket => (
              <TicketListItem ticket={ticket} key={ticket.id} />
            ))
          )}
        </List>
      </div>
      <div style={{ display: tabOpen === "pending" ? "block" : "none" }}>
        <List style={{ paddingTop: 0 }}>
          {(loading && !hasInitialLoad) ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              Carregando tickets pendentes...
            </div>
          ) : pendingTickets.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>
              Nenhum ticket pendente
            </div>
          ) : (
            pendingTickets.map(ticket => (
              <TicketListItem ticket={ticket} key={ticket.id} />
            ))
          )}
        </List>
      </div>
    </>
  );
};

const useStyles = makeStyles((theme) => ({
  ticketsWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.primary,
  },
  tabsHeader: {
    flex: "none",
    backgroundColor: theme.palette.background.paper,
  },
  settingsIcon: {
    alignSelf: "center",
    marginLeft: "auto",
    padding: 8,
  },
  tab: {
    minWidth: 120,
    width: 120,
  },
  ticketOptionsBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: theme.palette.background.paper,
    padding: theme.spacing(1),
  },
  serachInputWrapper: {
    flex: 1,
    background: theme.palette.background.default,
    display: "flex",
    borderRadius: 40,
    padding: 4,
    marginRight: theme.spacing(1),
  },
  searchIcon: {
    color: "grey",
    marginLeft: 6,
    marginRight: 6,
    alignSelf: "center",
  },
  searchInput: {
    flex: 1,
    border: "none",
    borderRadius: 30,
    color: theme.palette.text.primary, 
    backgroundColor: theme.palette.background.default,
  },
  badge: {
    right: "-10px",
  },
  show: {
    display: "block",
  },
  hide: {
    display: "none !important",
  },
}));

const TicketsManager = () => {
  const classes = useStyles();
  const [searchParam, setSearchParam] = useState("");
  const [tab, setTab] = useState("open");
  const [tabOpen, setTabOpen] = useState("open");
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const searchInputRef = useRef();
  const { user } = useContext(AuthContext);
  const [openCount, setOpenCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const userQueueIds = user.queues.map((q) => q.id);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);

  useEffect(() => {
    if (user.profile.toUpperCase() === "ADMIN") {
      setShowAllTickets(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "search") {
      searchInputRef.current.focus();
      setSearchParam("");
    }
  }, [tab]);

  let searchTimeout;

  const handleSearch = (e) => {
    const searchedTerm = e.target.value.toLowerCase();

    clearTimeout(searchTimeout);

    if (searchedTerm === "") {
      setSearchParam(searchedTerm);
      setTab("open");
      return;
    }

    searchTimeout = setTimeout(() => {
      setSearchParam(searchedTerm);
    }, 500);
  };

  const handleChangeTab = (e, newValue) => {
    setTab(newValue);
  };

  const handleChangeTabOpen = (e, newValue) => {
    setTabOpen(newValue);
  };

  return (
    <Paper elevation={0} variant="outlined" className={classes.ticketsWrapper}>
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={(e) => setNewTicketModalOpen(false)}
      />
      <Paper elevation={0} square className={classes.tabsHeader}>
        <Tabs
          value={tab}
          onChange={handleChangeTab}
          variant="fullWidth"
          indicatorColor="primary"
          textColor="primary"
          aria-label="icon label tabs example"
        >
          <Tab
            value={"open"}
            icon={<MoveToInboxIcon />}
            label={i18n.t("tickets.tabs.open.title")}
            classes={{ root: classes.tab }}
          />
          <Tab
            value={"closed"}
            icon={<CheckBoxIcon />}
            label={i18n.t("tickets.tabs.closed.title")}
            classes={{ root: classes.tab }}
          />
          <Tab
            value={"search"}
            icon={<SearchIcon />}
            label={i18n.t("tickets.tabs.search.title")}
            classes={{ root: classes.tab }}
          />
        </Tabs>
      </Paper>
      <Paper square elevation={0} className={classes.ticketOptionsBox}>
        {tab === "search" ? (
          <div className={classes.serachInputWrapper}>
            <SearchIcon className={classes.searchIcon} />
            <InputBase
              className={classes.searchInput}
              inputRef={searchInputRef}
              placeholder={i18n.t("tickets.search.placeholder")}
              type="search"
              onChange={handleSearch}
            />
          </div>
        ) : (
          <>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => setNewTicketModalOpen(true)}
            >
              {i18n.t("ticketsManager.buttons.newTicket")}
            </Button>
            <Can
              role={user.profile}
              perform="tickets-manager:showall"
              yes={() => (
                <FormControlLabel
                  label={i18n.t("tickets.buttons.showAll")}
                  labelPlacement="start"
                  control={
                    <Switch
                      size="small"
                      checked={showAllTickets}
                      onChange={() =>
                        setShowAllTickets((prevState) => !prevState)
                      }
                      name="showAllTickets"
                      color="primary"
                    />
                  }
                />
              )}
            />
          </>
        )}
        <TicketsQueueSelect
          style={{ marginLeft: 6 }}
          selectedQueueIds={selectedQueueIds}
          userQueues={user?.queues}
          onChange={(values) => setSelectedQueueIds(values)}
        />
      </Paper>
      <TabPanel value={tab} name="open" className={classes.ticketsWrapper}>
        <Tabs
          value={tabOpen}
          onChange={handleChangeTabOpen}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab
            label={
              <Badge
                className={classes.badge}
                badgeContent={openCount}
                color="primary"
              >
                {i18n.t("ticketsList.assignedHeader")}
              </Badge>
            }
            value={"open"}
          />
          <Tab
            label={
              <Badge
                className={classes.badge}
                badgeContent={pendingCount}
                color="secondary"
              >
                {i18n.t("ticketsList.pendingHeader")}
              </Badge>
            }
            value={"pending"}
          />
        </Tabs>
        <Paper className={classes.ticketsWrapper}>
          <CombinedTicketsList
            tabOpen={tabOpen}
            showAll={showAllTickets}
            selectedQueueIds={selectedQueueIds}
            updateOpenCount={(val) => setOpenCount(val)}
            updatePendingCount={(val) => setPendingCount(val)}
          />
        </Paper>
      </TabPanel>
      <TabPanel value={tab} name="closed" className={classes.ticketsWrapper}>
        <TicketsList
          status="closed"
          showAll={true}
          selectedQueueIds={selectedQueueIds}
        />
      </TabPanel>
      <TabPanel value={tab} name="search" className={classes.ticketsWrapper}>
        <TicketsList
          searchParam={searchParam}
          showAll={true}
          selectedQueueIds={selectedQueueIds}
        />
      </TabPanel>
    </Paper>
  );
};

export default TicketsManager;