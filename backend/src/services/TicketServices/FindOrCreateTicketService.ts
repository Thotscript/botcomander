import { subHours } from "date-fns";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import { getIO } from "../../libs/socket";

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  groupContact?: Contact
): Promise<Ticket> => {
  let ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending"]
      },
      contactId: groupContact ? groupContact.id : contact.id,
      whatsappId: whatsappId
    }
  });

  let isNewTicket = false;
  let wasReopened = false;

  if (ticket) {
    await ticket.update({ unreadMessages });
  }

  if (!ticket && groupContact) {
    ticket = await Ticket.findOne({
      where: {
        contactId: groupContact.id,
        whatsappId: whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      wasReopened = true;
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages
      });
    }
  }

  if (!ticket && !groupContact) {
    ticket = await Ticket.findOne({
      where: {
        updatedAt: {
          [Op.between]: [+subHours(new Date(), 2), +new Date()]
        },
        contactId: contact.id,
        whatsappId: whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      wasReopened = true;
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages
      });
    }
  }

  if (!ticket) {
    isNewTicket = true;
    ticket = await Ticket.create({
      contactId: groupContact ? groupContact.id : contact.id,
      status: "pending",
      isGroup: !!groupContact,
      unreadMessages,
      whatsappId
    });
  }

  ticket = await ShowTicketService(ticket.id);

  // Emitir evento quando um novo ticket é criado ou reaberto como pending
  if (isNewTicket || wasReopened || ticket.status === "pending") {
    const io = getIO();
    
    console.log("Emitindo evento para ticket pendente:", ticket.id);
    
    // Emite para a sala "pending"
    io.to("pending").emit("ticket", {
      action: "update",
      ticket
    });
    
    // Emite também o evento appMessage para garantir que a lista seja atualizada
    io.to("pending").emit("appMessage", {
      action: "create",
      ticket
    });

    // Emite para a sala de notificação
    io.to("notification").emit("ticket", {
      action: "update",
      ticket
    });

    // Se foi reaberto (era closed e voltou para pending), remove da lista closed
    if (wasReopened) {
      io.to("closed").emit("ticket", {
        action: "delete",
        ticketId: ticket.id
      });
    }
  }

  return ticket;
};

export default FindOrCreateTicketService;
