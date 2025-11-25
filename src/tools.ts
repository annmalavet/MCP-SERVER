import { z } from "zod";
import { server } from "./server.js";
import { Resend } from "resend";

const kReg = Symbol.for("mcp.registered");
const g = globalThis as Record<string | symbol, unknown>;
const registered = (g[kReg] ??= new Set<string>()) as Set<string>;


const resend = new Resend(process.env.RESEND_API_KEY);
const staticSearchUrl = process.env.EMAIL_SEARCH_API_URL;
const appointmentServiceUrl = process.env.APPOINTMENT_SERVICE_URL;

const createAppointmentSchema = {
  dateTime: z.string().datetime().describe("The appointment start time."),
  attendeeEmail: z.string().email().describe("The email of the person to invite."),
  durationInMinutes: z.number().int().positive().describe("The duration."),
};
const searchEmailsSchema = {
  query: z.string().min(1).describe("The text to search for in the email archive."),
};

const sendEmailSchema = {
  to: z.string().email().describe("The recipient's email address."),
  subject: z.string().min(1).describe("The subject line of the email."),
  body: z.string().min(1).describe("The plain text content of the email."),
};


function registerOnce(
  name: string,
  meta: Parameters<typeof server.registerTool>[1],
  handler: Parameters<typeof server.registerTool>[2]
) {
  if (registered.has(name)) return;
  server.registerTool(name, meta, handler);
  registered.add(name);
}

registerOnce(
      'search_emails',
      {
        title: 'Search Email Archive',
        description: 'Searches the static email archive for a query.',
        inputSchema: searchEmailsSchema,
      },
      async (params) => {
        console.log(`Tool 'search_emails' called with query: ${params.query}`);
        if (!staticSearchUrl) {
          return { content: [{ type: 'text', text: 'Error: The STATIC_SEARCH_API_URL is not configured.' }] };
        }

        try {
          const response = await fetch(`${staticSearchUrl}/search?q=${encodeURIComponent(params.query)}`);
          
          if (!response.ok) {
            throw new Error(`Search service responded with status ${response.status}`);
          }

          // Search email returns JSON
          const searchResults = await response.json();
          
          const formattedResults = `Search found ${searchResults.length} results:\n` +
            searchResults.map((r: any) => `- ${r.subject} (from: ${r.from})`).join('\n');
            
          return { content: [{ type: 'text', text: formattedResults }] };

        } catch (e) {
          return { content: [{ type: 'text', text: `Error searching emails: ${Error}` }] };
        }
      }
    );

registerOnce('create_appointment',
      {
        inputSchema: createAppointmentSchema, 
      },
      // runs when the tool is called
      async (params) => {
        console.log(`Tool 'create_appointment' called.`);
        
        if (!appointmentServiceUrl) {
          return { content: [{ type: 'text', text: 'Error: The APPOINTMENT_SERVICE_URL is not configured.' }] };
        }

        try {
          // calls Python service
          const response = await fetch(`${appointmentServiceUrl}/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              doctor_id: '', 
              date: params.dateTime.split('T')[0], 
              time: params.dateTime.split('T')[1], 
              
            }),
          });

          if (!response.ok) {
            throw new Error(`Appointment service responded with status ${response.status}`);
          }

          const newAppointment = await response.json();
          const resultText = `Success! Appointment ${newAppointment.appointment_id} is ${newAppointment.status}.`;
         
          return { content: [{ type: 'text', text: resultText }] };

        } catch (e) {
          return { content: [{ type: 'text', text: `An unexpected error occurred: ${Error}` }] };
        }
      }
    );

registerOnce('send_email',
      {
        inputSchema: sendEmailSchema,
      },
      async (params) => {
        console.log(`Tool 'send_email' called.`);
        try {
          const { data, error } = await resend.emails.send({
            from: 'PlaceHolder Name <test@domain-holder.com>',
            to: [params.to],
            subject: params.subject,
            text: params.body,
          });

          if (error) {
            return { content: [{ type: 'text', text: `Failed to send email: ${error.message}` }] };
          }
          return { content: [{ type: 'text', text: `Email sent successfully ID: ${data.id}` }] };
        } catch (e) {
          return { content: [{ type: 'text', text: `An unexpected error occurred: ${Error}` }] };
        }
      }
    );