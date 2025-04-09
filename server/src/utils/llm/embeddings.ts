import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { ModelType } from 'src/types/chat';
import { KeyConfiguration } from 'src/types/keyConfiguration';

export const getEmbeddings = (keyConfiguration: KeyConfiguration) => {
  const {
    apiType,
    azureApiKey,
    azureInstanceName,
    azureEmbeddingDeploymentName,
    azureApiVersion,
    apiKey,
    basePath,
  } = keyConfiguration;
  return apiType === ModelType.AZURE_OPENAI
    ? new OpenAIEmbeddings(
        {
          azureOpenAIApiKey: azureApiKey,
          azureOpenAIApiInstanceName: azureInstanceName,
          azureOpenAIApiDeploymentName: azureEmbeddingDeploymentName,
          azureOpenAIApiVersion: azureApiVersion,
        },
        {
          basePath,
        }
      )
    : new OpenAIEmbeddings(
        {
          openAIApiKey: apiKey,
        },
        {
          basePath,
        }
      );
};
