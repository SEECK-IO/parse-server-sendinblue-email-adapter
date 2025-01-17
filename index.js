/**
 * @module SendinBlue adapter for parse-server
 * @description Used to send reset password and verification emails through SendinBlue
 */
var SendinBlueSdk = require( "sib-api-v3-sdk" );
var SendinBlueClient = SendinBlueSdk.ApiClient.instance;

var sendinBlueAdapter = options => {
  // check the required options
  if ( !options || !options.apiKey ||
    !options.fromName || !options.fromEmail ||
    !options.translation || !options.translation.default
  )
  {
    throw "SendinBlueAdapter requires: an API key, a default email for the sender, a default name for the sender and the translation default options.";
  }

  // check the password reset options
  if ( !options.passwordResetTemplateId &&
    ( !options.passwordResetSubject || !options.passwordResetTextPart || !options.passwordResetHtmlPart )
  )
  {
    throw "If passwordResetTemplateId is not set, you have to define passwordResetSubject, passwordResetTextPart and passwordResetHtmlPart.";
  }

  // check the validation options
  if ( !options.verificationEmailTemplateId &&
    ( !options.verificationEmailSubject || !options.verificationEmailTextPart || !options.verificationEmailHtmlPart )
  )
  {
    throw "If verificationEmailTemplateId is not set, you have to define verificationEmailSubject, verificationEmailTextPart and verificationEmailHtmlPart.";
  }

  var SendinBlueApiKey = SendinBlueClient.authentications[ "api-key" ];
  SendinBlueApiKey.apiKey = options.apiKey;

  /**
   * @function getOptions
   * @description Get the [individual] options for the specific mailing task
   */
  var getOptions = mail => {
    if ( options.getIndividualOptions )
    {
      return Promise.resolve( options.getIndividualOptions( mail ) ).then( opts => {
        return Object.assign( {}, options, opts );
      } );
    }
    else
    {
      return Promise.resolve( options );
    }
  };


  /**
   * @function replaceVariables
   * @description Replace the email, application's name, and link variables with
   * with the correct value into the given text
   */
  var replaceVariables = ( text, mail ) => {
    var result = text;
    if ( result )
    {
      result = result.replace( "{EMAIL}", mail.to );
      result = result.replace( "%APP_NAME%", mail.appName );
      result = result.replace( "%LINK%", mail.link );
      result = result.replace( "%LINK_SHORT%", mail.link.replace( /^https?\:\/\//i, "" ) );
      result = result.replace( "USERNAME", mail.user.get( "username" ) );
      result = result.repace( "HOST_URL", options.hostUrl || "" );
    }
    return result;
  };


  /**
   * @function sendLink
   * @description Sends the reset password or verify email links
   */
  var sendLink = ( mail, opts, templates, subjects, textParts, htmlParts ) => {
    // lookup for email in username field if email is undefined
    var email = mail.user.get( "email" ) || mail.user.get( "username" );

    // look if a locale field is defined for the User class
    var locale = options.translation.default;

    if ( options.translation.locale )
    {
      var user_locale = mail.user.get( options.translation.locale );
      if ( user_locale )
      {
        locale = user_locale;
      }
    }

    // get the template id according to the locale of the user
    if ( templates )
    {
      var templateId = templates[ locale ];

      if ( !templateId )
      {
        templateId = templates[ options.translation.default ];
      }

      // construct and send the request to SendinBlue
      var smtpApi = new SendinBlueSdk.TransactionalEmailsApi();
      var sendEmail = new SendinBlueSdk.SendEmail();

      sendEmail.emailTo = [ email ];
      sendEmail.attributes = {
        "APP_NAME": mail.appName,
        "LINK": mail.link,
        "LINK_SHORT": mail.link.replace( /^https?\:\/\//i, "" ),
        "USERNAME": mail.user.get( "username" ),
        "HOST_URL": options.hostUrl || "",
      };

      return new Promise( ( resolve, reject ) => {
        smtpApi.sendTemplate( templateId, sendEmail ).then( resolve, reject );
      } ).catch( ( e ) => { console.log( e ); throw e; } );
    }

    // if not template was defined, use the plain/html options
    else
    {
      return sendMail( {
        appName: mail.appName,
        link: mail.link,
        to: email,
        subject: subjects[ locale ] ? subjects[ locale ] : subjects[ options.translation.default ],
        text: textParts[ locale ] ? textParts[ locale ] : textParts[ options.translation.default ],
        html: htmlParts[ locale ] ? htmlParts[ locale ] : htmlParts[ options.translation.default ]
      } );
    }
  };


  /**
   * @function sendPasswordResetEmail
   * @description Sends the link to reset the password
   */
  var sendPasswordResetEmail = mail => {
    return getOptions( mail ).then( opts => {
      return sendLink(
        mail,
        opts,
        opts.passwordResetTemplateId,
        opts.passwordResetSubject,
        opts.passwordResetTextPart,
        opts.passwordResetHtmlPart
      );
    } );
  };


  /**
   * @function sendVerificationEmail
   * @description Sends the link to verify an email
   */
  var sendVerificationEmail = mail => {
    return getOptions( mail ).then( opts => {
      return sendLink(
        mail,
        opts,
        opts.verificationEmailTemplateId,
        opts.verificationEmailSubject,
        opts.verificationEmailTextPart,
        opts.verificationEmailHtmlPart
      );
    } );
  };


  /**
   * @function sendMail
   * @description Sends a pre-defined email
   */
  var sendMail = mail => {
    return getOptions( mail ).then( opts => {
      // replace the variables into the subject, plain text and html text
      var subject = replaceVariables( mail.subject, mail );
      var text = replaceVariables( mail.text, mail );
      var html = replaceVariables( mail.html, mail );

      // construct and send the request to SendinBlue
      var smtpApi = new SendinBlueSdk.TransactionalEmailsApi();
      var sendSmtpEmail = new SendinBlueSdk.SendSmtpEmail();

      var sender = new SendinBlueSdk.SendSmtpEmailSender();
      sender.name = opts.fromName;
      sender.email = opts.fromEmail;

      var to = new SendinBlueSdk.SendSmtpEmailTo();
      to.email = mail.to;

      sendSmtpEmail.sender = sender;
      sendSmtpEmail.to = [ to ];
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.textContent = text;
      sendSmtpEmail.htmlContent = html;

      return new Promise( ( resolve, reject ) => {
        smtpApi.sendTransacEmail( sendSmtpEmail ).then( resolve, reject );
      } ).catch( ( e ) => { console.log( e ); throw e; } );
    } );
  };


  return Object.freeze( {
    sendVerificationEmail: sendVerificationEmail,
    sendPasswordResetEmail: sendPasswordResetEmail,
    sendMail: sendMail
  } );
};

module.exports = sendinBlueAdapter;
